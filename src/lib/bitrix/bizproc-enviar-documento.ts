import type { AppAuth } from "@/lib/bitrix/bitrix24";
import { getPublicAppUrl } from "@/lib/env";
import { bitrixRestGet, bitrixRestPostForm } from "@/lib/bitrix/bitrix24";

function extractRobotCodes(result: unknown): string[] {
  if (!Array.isArray(result)) return [];
  return result
    .map((x) => {
      if (typeof x === "string") return x;
      if (
        x &&
        typeof x === "object" &&
        "CODE" in x &&
        typeof (x as { CODE: string }).CODE === "string"
      ) {
        return (x as { CODE: string }).CODE;
      }
      return "";
    })
    .filter(Boolean);
}

/** Robô BizProc para enviar documento via template D4Sign */
export async function ensureBizprocEnviarDocumento(
  auth: AppAuth,
): Promise<void> {
  const base = getPublicAppUrl();
  if (!base) throw new Error("PUBLIC_APP_URL ausente");
  const handler = `${base.replace(/\/$/, "")}/bitrix/enviar-documento`;

  const listRes = (await bitrixRestGet(
    auth.domain,
    auth.accessToken,
    "bizproc.robot.list",
  )) as { result?: unknown };

  const codes = extractRobotCodes(listRes?.result);

  // Se existir o robô legado sem template, atualiza para a nova versão
  if (codes.includes("ENVIAR_DOCUMENTO_D4SIGN")) {
    await bitrixRestPostForm(auth.domain, auth.accessToken, "bizproc.robot.update", {
      CODE: "ENVIAR_DOCUMENTO_D4SIGN",
      HANDLER: handler,
      NAME: { pt: "D4Sign — Enviar Documento", en: "D4Sign — Send Document" },
      USE_SUBSCRIPTION: "Y",
      PROPERTIES: buildProperties(),
      FILTER: buildFilter(),
    });
    return;
  }

  await bitrixRestPostForm(auth.domain, auth.accessToken, "bizproc.robot.add", {
    CODE: "ENVIAR_DOCUMENTO_D4SIGN",
    HANDLER: handler,
    NAME: { pt: "D4Sign — Enviar Documento", en: "D4Sign — Send Document" },
    DESCRIPTION: {
      pt: "Gera e envia documento para assinatura via D4Sign usando um template configurado.",
      en: "Generates and sends a document for signature via D4Sign using a configured template.",
    },
    USE_SUBSCRIPTION: "Y",
    PROPERTIES: buildProperties(),
    FILTER: buildFilter(),
  });
}

function buildFilter() {
  return {
    INCLUDE: [
      ["crm", "CCrmDocumentDeal"],
      ["crm", "CCrmDocumentLead"],
    ],
  };
}

function buildProperties() {
  return {
    template_id: {
      Name: { pt: "ID do Template D4Sign", en: "D4Sign Template ID" },
      Description: {
        pt: "ID do template configurado em Operação → Templates. Ex: MjAyOTQw",
        en: "Template ID configured in Operation → Templates.",
      },
      Required: "Y",
      Multiple: "N",
      Default: "",
      Type: "string",
    },
    document_name: {
      Name: { pt: "Nome do Documento", en: "Document Name" },
      Description: {
        pt: "Nome que o documento receberá no D4Sign.",
        en: "Name the document will receive in D4Sign.",
      },
      Required: "N",
      Multiple: "N",
      Default: "",
      Type: "string",
    },
    signers_emails: {
      Name: { pt: "E-mails dos Signatários", en: "Signers Emails" },
      Description: {
        pt: "E-mails dos signatários separados por vírgula. Ex: joao@empresa.com,maria@empresa.com",
        en: "Signers emails separated by comma.",
      },
      Required: "Y",
      Multiple: "N",
      Default: "",
      Type: "string",
    },
    envelope: {
      Name: { pt: "Criar envelope?", en: "Create envelope?" },
      Description: { pt: "Criar envelope e adiciona o documento.", en: "Create envelope and add document." },
      Required: "Y",
      Multiple: "N",
      Default: "N",
      Type: "select",
      Options: { Y: "Sim", N: "Não" },
    },
  };
}
