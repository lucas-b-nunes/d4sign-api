import {
  d4signDownloadDocument,
  type D4SignClientConfig,
} from "@/lib/d4sign/client";
import {
  bitrixUpdateCrmEntity,
  resolveBitrixAccessToken,
} from "@/lib/bitrix/crm-update";
import {
  bitrixAddTimelineComment,
  formatDocumentStatusComment,
  type TimelineCommentFile,
} from "@/lib/bitrix/timeline-comment";
import { toAppAuth } from "@/lib/tenant";
import type { CoreDomain, CoreApp, Setting, D4SignCredential, CoreCredential } from "@/generated/prisma/client";
import { extractTypePost } from "@/lib/d4sign/parse-webhook-body";

type DocumentRow = {
  uuidDoc: string;
  entityType: string;
  entityId: string;
  statusName: string | null;
  app: CoreApp & {
    domain: CoreDomain;
    credentials: CoreCredential | null;
    setting: Setting | null;
    d4signCredential: D4SignCredential | null;
  };
};

const TYPE_POST_STATUS: Record<string, { statusName: string; statusId: number }> = {
  "1": { statusName: "Finalizado", statusId: 4 },
  "2": { statusName: "E-mail não entregue", statusId: 3 },
  "3": { statusName: "Cancelado", statusId: 6 },
  "4": { statusName: "Assinado", statusId: 3 },
};

function resolveStatus(body: Record<string, unknown>): {
  statusName: string;
  statusId: number;
} {
  const typePost = extractTypePost(body);
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (typePost && TYPE_POST_STATUS[typePost]) {
    const mapped = TYPE_POST_STATUS[typePost];
    return {
      statusName: mapped.statusName,
      statusId: mapped.statusId,
    };
  }

  if (typeof body.statusName === "string" && body.statusName.trim()) {
    const statusId =
      typeof body.statusId === "number"
        ? body.statusId
        : typeof body.statusId === "string"
          ? Number.parseInt(body.statusId, 10)
          : 0;
    return {
      statusName: body.statusName.trim(),
      statusId: Number.isFinite(statusId) ? statusId : 0,
    };
  }

  return {
    statusName: message || "Atualizado via webhook",
    statusId: 0,
  };
}

async function downloadSignedPdf(
  config: D4SignClientConfig,
  uuidDoc: string,
): Promise<{ fileName: string; base64: string }> {
  const meta = await d4signDownloadDocument(config, uuidDoc);
  console.log("[webhook-d4sign] download D4Sign:", {
    name: meta.name,
    urlPreview: meta.url?.slice(0, 80),
  });

  if (!meta.url) throw new Error("D4Sign download não retornou URL");

  const res = await fetch(meta.url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao baixar PDF: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const baseName = meta.name?.trim() || `${uuidDoc}.pdf`;
  const fileName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;

  console.log("[webhook-d4sign] PDF baixado:", { fileName, bytes: buffer.length });
  return { fileName, base64: buffer.toString("base64") };
}

export async function processD4SignWebhook(
  doc: DocumentRow,
  body: Record<string, unknown>,
): Promise<{ statusName: string; statusId: number; bitrixUpdated: boolean }> {
  const { app } = doc;
  const cred = app.credentials;
  const d4cred = app.d4signCredential;
  const setting = app.setting;

  console.log("[webhook-d4sign] processando:", {
    uuidDoc: doc.uuidDoc,
    entityType: doc.entityType,
    entityId: doc.entityId,
    type_post: extractTypePost(body),
    message: body.message,
    email: body.email,
    statusField: setting?.d4signDocumentStatusField ?? null,
    attachField: setting?.d4signDocumentAttachField ?? null,
  });

  const { statusName, statusId } = resolveStatus(body);
  let bitrixUpdated = false;

  if (!cred) {
    console.warn("[webhook-d4sign] credenciais Bitrix ausentes — pulando sync CRM");
    return { statusName, statusId, bitrixUpdated };
  }

  const statusField = setting?.d4signDocumentStatusField;
  const attachField = setting?.d4signDocumentAttachField;
  const typePost = extractTypePost(body);
  const shouldAttachPdf = typePost === "1" && Boolean(attachField);

  const auth = toAppAuth(app.domain, cred);
  const accessToken = await resolveBitrixAccessToken({ ...auth, appId: app.id });

  const fields: Record<string, unknown> = {};
  let timelineFiles: TimelineCommentFile[] | undefined;

  if (statusField) {
    fields[statusField] = statusName;
    console.log("[webhook-d4sign] status → Bitrix:", { field: statusField, value: statusName });
  }

  if (shouldAttachPdf) {
    if (!d4cred) {
      throw new Error("Credenciais D4Sign ausentes para download do PDF");
    }
    const d4config: D4SignClientConfig = {
      tokenApi: d4cred.tokenApi,
      cryptKey: d4cred.cryptKey,
    };
    const pdf = await downloadSignedPdf(d4config, doc.uuidDoc);
    fields[attachField!] = { fileData: [pdf.fileName, pdf.base64] };
    timelineFiles = [[pdf.fileName, pdf.base64]];
    console.log("[webhook-d4sign] anexo → Bitrix:", {
      field: attachField,
      fileName: pdf.fileName,
    });
  } else if (typePost === "1" && d4cred) {
    // Documento finalizado: anexa PDF no comentário da timeline mesmo sem campo de anexo
    try {
      const d4config: D4SignClientConfig = {
        tokenApi: d4cred.tokenApi,
        cryptKey: d4cred.cryptKey,
      };
      const pdf = await downloadSignedPdf(d4config, doc.uuidDoc);
      timelineFiles = [[pdf.fileName, pdf.base64]];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[webhook-d4sign] PDF para timeline ignorado:", msg);
    }
  }

  if (Object.keys(fields).length > 0) {
    await bitrixUpdateCrmEntity(
      app.domain.name,
      accessToken,
      doc.entityType,
      doc.entityId,
      fields,
    );
    bitrixUpdated = true;
  }

  const email = typeof body.email === "string" ? body.email : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;
  const timelineComment = formatDocumentStatusComment({
    uuidDoc: doc.uuidDoc,
    statusName,
    previousStatus: doc.statusName,
    email,
    message,
  });

  try {
    await bitrixAddTimelineComment(app.domain.name, accessToken, {
      entityType: doc.entityType,
      entityId: doc.entityId,
      comment: timelineComment,
      files: timelineFiles,
    });
    bitrixUpdated = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webhook-d4sign] falha ao adicionar comentário na timeline:", msg);
    if (!bitrixUpdated) throw e;
  }

  if (!statusField && !shouldAttachPdf) {
    console.log(
      "[webhook-d4sign] campos globais não configurados — timeline atualizada mesmo assim",
    );
  }

  return { statusName, statusId, bitrixUpdated };
}
