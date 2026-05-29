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

/** Paridade com `reference-clicksign` BizprocEnviarDocumento::create */
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
  if (codes.includes("ENVIAR_DOCUMENTO")) return;

  await bitrixRestPostForm(auth.domain, auth.accessToken, "bizproc.robot.add", {
    CODE: "ENVIAR_DOCUMENTO",
    HANDLER: handler,
    NAME: { en: "Enviar documento" },
    DESCRIPTION: { en: "Enviar documento para assinatura" },
    PROPERTIES: {
      token: {
        Name: { en: "Envio do token" },
        Description: {
          en: "Tipo de autenticação para realizar assinatura",
        },
        Required: "Y",
        Multiple: "N",
        Default: "",
        Type: "select",
        Options: {
          email: "Email",
          sms: "SMS",
          whatsapp: "Whatsapp",
        },
      },
      sequencia: {
        Name: { en: "Ativar sequencia" },
        Description: { en: "Ativa sequencia de assinatura" },
        Required: "Y",
        Multiple: "N",
        Default: "N",
        Type: "select",
        Options: { Y: "Sim", N: "Não" },
      },
      refusable: {
        Name: { en: "Recusar documento?" },
        Description: {
          en: "Determina se o signatário pode recusar ou não a assinatura do documento.",
        },
        Required: "Y",
        Multiple: "N",
        Default: "N",
        Type: "select",
        Options: { Y: "Sim", N: "Não" },
      },
      envelope: {
        Name: { en: "Criar envelope?" },
        Description: { en: "Criar envelope e adiciona o documento!" },
        Required: "Y",
        Multiple: "N",
        Default: "N",
        Type: "select",
        Options: { Y: "Sim", N: "Não" },
      },
    },
    DOCUMENT_TYPE: ["crm", "CCrmDocumentLead", "LEAD"],
  });
}
