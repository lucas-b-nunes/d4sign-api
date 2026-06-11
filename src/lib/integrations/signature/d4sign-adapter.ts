import {
  d4signAddSigners,
  d4signBuildFromTemplate,
  d4signConfigureWebhook,
  d4signDownloadDocument,
  d4signListSafes,
  d4signListTemplates,
  d4signPing,
  d4signSendToSigner,
  type D4SignClientConfig,
} from "@/lib/d4sign/client";
import { buildD4SignTemplatePayload } from "@/lib/d4sign/template-payload";
import type { ISignatureAdapter, SendSignatureDocumentParams } from "./types";

export function createD4SignAdapter(config: {
  tokenApi: string;
  cryptKey?: string | null;
}): ISignatureAdapter {
  const d4config: D4SignClientConfig = {
    tokenApi: config.tokenApi,
    cryptKey: config.cryptKey,
  };

  return {
    provider: "d4sign",

    async ping() {
      const r = await d4signPing(d4config);
      return { ok: r.ok };
    },

    async listSafes() {
      return d4signListSafes(d4config);
    },

    async sendDocument(params: SendSignatureDocumentParams) {
      const templatePayload = buildD4SignTemplatePayload(params.templateVariables);

      // D4Sign tem endpoints distintos para templates html vs word
      let templateType = "word";
      try {
        const catalog = await d4signListTemplates(d4config);
        const meta = Object.values(catalog).find((t) => t.id === params.templateId);
        if (meta?.type) templateType = meta.type;
      } catch {
        // default word
      }

      const buildResult = await d4signBuildFromTemplate(
        d4config,
        params.safeUuid,
        params.documentName,
        { [params.templateId]: templatePayload },
        templateType,
      );
      const uuidDoc = buildResult.uuid;

      if (params.webhookUrl) {
        try {
          await d4signConfigureWebhook(d4config, uuidDoc, params.webhookUrl);
          console.log("[d4sign-adapter] webhook configurado:", params.webhookUrl);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[d4sign-adapter] falha ao configurar webhook:", msg);
        }
      }

      if (params.signers.length > 0) {
        const signers = params.signers.map(({ email }) => ({
          email,
          act: "1",
          foreign: "0",
          certificadoicpbr: "0",
          assinatura_presencial: "0",
        }));
        await d4signAddSigners(d4config, uuidDoc, signers);
        await d4signSendToSigner(d4config, uuidDoc);
      }

      return { uuidDoc };
    },

    async downloadDocument(uuidDoc: string) {
      const meta = await d4signDownloadDocument(d4config, uuidDoc);
      if (!meta.url) throw new Error("D4Sign download não retornou URL");

      const res = await fetch(meta.url, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Falha ao baixar PDF: HTTP ${res.status} — ${text.slice(0, 200)}`,
        );
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const baseName = meta.name?.trim() || `${uuidDoc}.pdf`;
      const fileName = baseName.toLowerCase().endsWith(".pdf")
        ? baseName
        : `${baseName}.pdf`;

      return { fileName, base64: buffer.toString("base64") };
    },
  };
}
