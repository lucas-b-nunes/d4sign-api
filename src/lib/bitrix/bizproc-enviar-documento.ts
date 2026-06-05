import type { AppAuth } from "@/lib/bitrix/bitrix24";
import { getPublicAppUrl } from "@/lib/env";
import { bitrixRestGet, bitrixRestPostForm } from "@/lib/bitrix/bitrix24";

type BitrixRestResponse = {
  result?: unknown;
  error?: string;
  error_description?: string;
};

function assertBitrixOk(res: unknown, action: string): void {
  const data = res as BitrixRestResponse;
  if (data?.error) {
    const desc = data.error_description ? `: ${data.error_description}` : "";
    throw new Error(`Bitrix ${action} falhou (${data.error}${desc})`);
  }
}

function extractRobotCodes(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result
      .map((x) => (typeof x === "string" ? x : ""))
      .filter(Boolean);
  }
  return [];
}

/**
 * Registra ou atualiza o robô BizProc "ENVIAR_DOCUMENTO_D4SIGN".
 * @param templateOptions Mapa { templateId: templateName } dos templates já mapeados.
 */
export async function ensureBizprocEnviarDocumento(
  auth: AppAuth,
  templateOptions: Record<string, string> = {},
): Promise<{ action: "add" | "update"; templateCount: number }> {
  const base = getPublicAppUrl();
  if (!base) throw new Error("PUBLIC_APP_URL ausente");
  const handler = `${base.replace(/\/$/, "")}/bitrix/enviar-documento`;

  const listRes = (await bitrixRestPostForm(
    auth.domain,
    auth.accessToken,
    "bizproc.robot.list",
    {},
  )) as BitrixRestResponse;
  assertBitrixOk(listRes, "bizproc.robot.list");

  const codes = extractRobotCodes(listRes.result);
  const properties = buildProperties(templateOptions);
  const filter = buildFilter();
  // Bitrix24 usa "br" para português (Brasil), não "pt"
  const name = { br: "D4Sign — Enviar Documento", en: "D4Sign — Send Document" };
  const description = {
    br: "Gera e envia documento para assinatura via D4Sign usando um template configurado.",
    en: "Generates and sends a document for signature via D4Sign using a configured template.",
  };

  if (codes.includes("ENVIAR_DOCUMENTO_D4SIGN")) {
    // bizproc.robot.update exige CODE + FIELDS (não campos no root)
    const updateRes = await bitrixRestPostForm(
      auth.domain,
      auth.accessToken,
      "bizproc.robot.update",
      {
        CODE: "ENVIAR_DOCUMENTO_D4SIGN",
        FIELDS: {
          HANDLER: handler,
          NAME: name,
          DESCRIPTION: description,
          USE_SUBSCRIPTION: "Y",
          PROPERTIES: properties,
          FILTER: filter,
        },
      },
    );
    assertBitrixOk(updateRes, "bizproc.robot.update");
    return { action: "update", templateCount: Object.keys(templateOptions).length };
  }

  const addRes = await bitrixRestPostForm(
    auth.domain,
    auth.accessToken,
    "bizproc.robot.add",
    {
      CODE: "ENVIAR_DOCUMENTO_D4SIGN",
      HANDLER: handler,
      NAME: name,
      DESCRIPTION: description,
      USE_SUBSCRIPTION: "Y",
      PROPERTIES: properties,
      FILTER: filter,
    },
  );
  assertBitrixOk(addRes, "bizproc.robot.add");
  return { action: "add", templateCount: Object.keys(templateOptions).length };
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
      Name: { br: "Template D4Sign", en: "D4Sign Template" },
      Description: {
        br: "Selecione o template configurado em Operação → Templates. Clique em 'Sincronizar robô' após adicionar novos templates.",
        en: "Select the template configured in Operation → Templates. Click 'Sync robot' after adding new templates.",
      },
      Required: "Y",
      Multiple: "N",
      Default: "",
      Type: "select",
      Options: hasOptions
        ? templateOptions
        : { "": "— configure templates primeiro —" },
    },
  };
}
