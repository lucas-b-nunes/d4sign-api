import { createD4SignAdapter } from "@/lib/integrations/signature/d4sign-adapter";
import { createCrmAdapterForApp } from "@/lib/integrations/crm/for-app";
import type { CrmNoteAttachment } from "@/lib/integrations/crm/types";
import { formatDocumentStatusComment } from "@/core/document-comments";
import type {
  CoreDomain,
  CoreApp,
  Setting,
  D4SignCredential,
  CoreCredential,
} from "@/generated/prisma/client";
import { extractTypePost } from "@/lib/d4sign/parse-webhook-body";
import {
  addSignedSignerEmail,
  formatPartialSignedStatus,
  parseSignedSignerEmails,
} from "@/lib/d4sign/signature-progress";

type DocumentRow = {
  uuidDoc: string;
  entityType: string;
  entityId: string;
  statusName: string | null;
  signerTotal: number | null;
  signedSignerEmails: unknown;
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

function resolveStatusWithSignerProgress(
  body: Record<string, unknown>,
  doc: DocumentRow,
): {
  statusName: string;
  statusId: number;
  signedSignerEmails: string[];
  signerTotal: number | null;
} {
  const typePost = extractTypePost(body);
  const signedSignerEmails = parseSignedSignerEmails(doc.signedSignerEmails);
  const signerTotal = doc.signerTotal;

  if (typePost === "4") {
    const mapped = TYPE_POST_STATUS["4"];
    const email = typeof body.email === "string" ? body.email : undefined;
    const updatedEmails = addSignedSignerEmail(signedSignerEmails, email);

    let statusName = mapped.statusName;
    if (signerTotal && signerTotal > 1) {
      statusName = formatPartialSignedStatus(updatedEmails.length, signerTotal);
    }

    return {
      statusName,
      statusId: mapped.statusId,
      signedSignerEmails: updatedEmails,
      signerTotal,
    };
  }

  const { statusName, statusId } = resolveStatus(body);
  return { statusName, statusId, signedSignerEmails, signerTotal };
}

export async function processD4SignWebhook(
  doc: DocumentRow,
  body: Record<string, unknown>,
): Promise<{
  statusName: string;
  statusId: number;
  bitrixUpdated: boolean;
  signedSignerEmails: string[];
  signerTotal: number | null;
}> {
  const { app } = doc;
  const d4cred = app.d4signCredential;
  const setting = app.setting;

  console.log("[webhook-d4sign] processando:", {
    uuidDoc: doc.uuidDoc,
    entityType: doc.entityType,
    entityId: doc.entityId,
    platform: app.domain.platform,
    type_post: extractTypePost(body),
    message: body.message,
    email: body.email,
    statusField: setting?.d4signDocumentStatusField ?? null,
    attachField: setting?.d4signDocumentAttachField ?? null,
  });

  const { statusName, statusId, signedSignerEmails, signerTotal } =
    resolveStatusWithSignerProgress(body, doc);
  let bitrixUpdated = false;

  const crm = await createCrmAdapterForApp(app);
  if (!crm) {
    console.warn("[webhook-d4sign] credenciais CRM ausentes — pulando sync");
    return { statusName, statusId, bitrixUpdated, signedSignerEmails, signerTotal };
  }

  const statusField = setting?.d4signDocumentStatusField;
  const attachField = setting?.d4signDocumentAttachField;
  const typePost = extractTypePost(body);
  const shouldAttachPdf = typePost === "1" && Boolean(attachField);

  const fields: Record<string, unknown> = {};
  let noteAttachments: CrmNoteAttachment[] | undefined;

  if (statusField) {
    fields[statusField] = statusName;
    console.log("[webhook-d4sign] status → CRM:", { field: statusField, value: statusName });
  }

  if (shouldAttachPdf) {
    if (!d4cred) {
      throw new Error("Credenciais D4Sign ausentes para download do PDF");
    }
    const signature = createD4SignAdapter({
      tokenApi: d4cred.tokenApi,
      cryptKey: d4cred.cryptKey,
    });
    const pdf = await signature.downloadDocument(doc.uuidDoc);
    fields[attachField!] = await crm.encodeFileFieldValue(pdf.fileName, pdf.base64);
    noteAttachments = [pdf];
    console.log("[webhook-d4sign] anexo → CRM:", {
      field: attachField,
      fileName: pdf.fileName,
    });
  } else if (typePost === "1" && d4cred) {
    // Documento finalizado: anexa PDF na nota mesmo sem campo de anexo
    try {
      const signature = createD4SignAdapter({
        tokenApi: d4cred.tokenApi,
        cryptKey: d4cred.cryptKey,
      });
      const pdf = await signature.downloadDocument(doc.uuidDoc);
      noteAttachments = [pdf];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[webhook-d4sign] PDF para nota ignorado:", msg);
    }
  }

  if (Object.keys(fields).length > 0) {
    await crm.updateEntity(doc.entityType, doc.entityId, fields);
    bitrixUpdated = true;
  }

  const email = typeof body.email === "string" ? body.email : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;
  const noteText = formatDocumentStatusComment({
    uuidDoc: doc.uuidDoc,
    statusName,
    previousStatus: doc.statusName,
    email,
    message,
  });

  try {
    await crm.addNote(doc.entityType, doc.entityId, noteText, noteAttachments);
    bitrixUpdated = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webhook-d4sign] falha ao adicionar nota CRM:", msg);
    if (!bitrixUpdated) throw e;
  }

  if (!statusField && !shouldAttachPdf) {
    console.log(
      "[webhook-d4sign] campos globais não configurados — nota CRM adicionada mesmo assim",
    );
  }

  return { statusName, statusId, bitrixUpdated, signedSignerEmails, signerTotal };
}
