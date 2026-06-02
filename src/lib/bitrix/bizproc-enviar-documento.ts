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

/**
 * Registra ou atualiza o robô BizProc "ENVIAR_DOCUMENTO_D4SIGN".
 * @param templateOptions Mapa { templateId: templateName } dos templates já mapeados.
 *                        Vazio na primeira instalação; sincronize depois via /api/bitrix/sync-robot.
 */
export async function ensureBizprocEnviarDocumento(
  auth: AppAuth,
  templateOptions: Record<string, string> = {},
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
  const properties = buildProperties(templateOptions);
  const filter = buildFilter();

  if (codes.includes("ENVIAR_DOCUMENTO_D4SIGN")) {
    await bitrixRestPostForm(auth.domain, auth.accessToken, "bizproc.robot.update", {
      CODE: "ENVIAR_DOCUMENTO_D4SIGN",
      HANDLER: handler,
      NAME: { pt: "D4Sign — Enviar Documento", en: "D4Sign — Send Document" },
      USE_SUBSCRIPTION: "Y",
      PROPERTIES: properties,
      FILTER: filter,
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
    PROPERTIES: properties,
    FILTER: filter,
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

function buildProperties(templateOptions: Record<string, string>) {
  const hasOptions = Object.keys(templateOptions).length > 0;

  return {
    template_id: {
      Name: { pt: "Template D4Sign", en: "D4Sign Template" },
      Description: {
        pt: "Selecione o template configurado em Operação → Templates. Clique em 'Sincronizar robô' após adicionar novos templates.",
        en: "Select the template configured in Operation → Templates. Click 'Sync robot' after adding new templates.",
      },
      Required: "Y",
      Multiple: "N",
      Default: "",
      Type: "select",
      Options: hasOptions ? templateOptions : { "": "— configure templates primeiro —" },
    },
  };
}
