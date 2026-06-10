import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { resolveTenantApp } from "@/lib/tenant";
import { getHubspotClientCredentials, getPublicAppUrl } from "@/lib/env";
import { verifyHubspotSignatureV3 } from "@/lib/hubspot/verify-signature";
import { ensureValidHubspotAccessToken } from "@/lib/hubspot/access-token";
import { resolveHubspotSignerEmails } from "@/lib/hubspot/resolve-signers";
import { createHubspotCrmAdapter } from "@/lib/integrations/crm/hubspot-adapter";
import { createD4SignAdapter } from "@/lib/integrations/signature/d4sign-adapter";
import {
  SendDocumentError,
  sendDocumentFromTemplate,
} from "@/core/send-document";

type WorkflowActionPayload = {
  callbackId?: string;
  origin?: { portalId?: number | string; actionDefinitionId?: number };
  object?: { objectId?: number | string; objectType?: string };
  inputFields?: Record<string, unknown>;
  fields?: Record<string, unknown>;
};

/**
 * Valida X-HubSpot-Signature-v3 quando o client secret está configurado.
 * Retorna null se ok, ou uma Response de erro.
 */
async function verifySignature(
  c: Context,
  rawBody: string,
): Promise<Response | null> {
  const { clientSecret } = getHubspotClientCredentials();
  if (!clientSecret) {
    console.warn("[hubspot-workflow] HUBSPOT_CLIENT_SECRET ausente — assinatura não verificada");
    return null;
  }

  const signature = c.req.header("x-hubspot-signature-v3") ?? null;
  const timestamp = c.req.header("x-hubspot-request-timestamp") ?? null;

  // URL pública como o HubSpot a enxerga (atrás de proxy/ngrok)
  const publicBase = getPublicAppUrl()?.replace(/\/$/, "") ?? "";
  const reqUrl = new URL(c.req.url);
  const fullUrl = publicBase
    ? `${publicBase}${reqUrl.pathname}${reqUrl.search}`
    : c.req.url;

  const ok = verifyHubspotSignatureV3({
    clientSecret,
    method: c.req.method,
    url: fullUrl,
    rawBody,
    signature,
    timestamp,
  });

  if (!ok) {
    console.warn("[hubspot-workflow] assinatura inválida — requisição rejeitada");
    return c.json({ error: "invalid_signature" }, 401);
  }
  return null;
}

function extractTemplateId(payload: WorkflowActionPayload): string | undefined {
  const fields = payload.inputFields ?? payload.fields ?? {};
  const raw = fields.templateId ?? fields.template_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return String(raw);
  return undefined;
}

function entityTypeFromObjectType(objectType?: string): string {
  switch ((objectType ?? "").toUpperCase()) {
    case "CONTACT":
      return "contact";
    case "COMPANY":
      return "company";
    default:
      return "deal";
  }
}

/**
 * POST /hubspot/enviar-documento
 * Endpoint de execução do Workflow Custom Action "Enviar documento D4Sign".
 */
export async function handleHubspotEnviarDocumento(c: Context) {
  const rawBody = await c.req.text();

  const sigError = await verifySignature(c, rawBody);
  if (sigError) return sigError;

  let payload: WorkflowActionPayload;
  try {
    payload = JSON.parse(rawBody) as WorkflowActionPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const portalId =
    payload.origin?.portalId != null ? String(payload.origin.portalId) : null;
  const objectId =
    payload.object?.objectId != null ? String(payload.object.objectId) : null;
  const entityType = entityTypeFromObjectType(payload.object?.objectType);
  const templateId = extractTemplateId(payload);

  console.log("[hubspot-workflow] enviar-documento:", {
    portalId,
    objectId,
    entityType,
    templateId,
  });

  if (!portalId || !objectId) {
    return c.json({ error: "portalId e objectId obrigatórios" }, 400);
  }

  const resolved = await resolveTenantApp(portalId);
  if (!resolved) {
    return c.json({ error: "tenant_not_found", portalId }, 401);
  }
  const { app } = resolved;

  if (!templateId) {
    return c.json(
      { error: "inputFields.templateId obrigatório. Selecione um template na ação do workflow." },
      400,
    );
  }

  const d4cred = app.d4signCredential;
  if (!d4cred) {
    return c.json({ error: "d4sign_credentials_missing" }, 500);
  }

  const safeUuid = d4cred.defaultSafeUuid;
  if (!safeUuid) {
    return c.json(
      { error: "Cofre padrão não configurado. Acesse Configurações → Globais." },
      400,
    );
  }

  const mapping = await prisma.templateMapping.findUnique({
    where: { appId_templateId: { appId: app.id, templateId } },
  });
  if (!mapping) {
    return c.json(
      {
        error: `Mapeamento do template "${templateId}" não encontrado. Configure em Operação → Templates.`,
        templateId,
      },
      400,
    );
  }

  if (!app.credentials) {
    return c.json({ error: "credentials_missing" }, 500);
  }

  const accessToken = await ensureValidHubspotAccessToken({
    appId: app.id,
    clientId: app.credentials.clientId,
    clientSecret: app.credentials.clientSecret,
    accessToken: app.credentials.accessToken,
    refreshToken: app.credentials.refreshToken,
    expiresAt: app.credentials.expiresAt,
  });
  if (!accessToken) {
    return c.json({ error: "token_unavailable" }, 500);
  }

  const crm = createHubspotCrmAdapter(accessToken);
  const signature = createD4SignAdapter({
    tokenApi: d4cred.tokenApi,
    cryptKey: d4cred.cryptKey,
  });
  const webhookUrl = `${(getPublicAppUrl() ?? "").replace(/\/$/, "")}/api/webhooks/d4sign`;

  try {
    const result = await sendDocumentFromTemplate({
      appId: app.id,
      entityType,
      entityId: objectId,
      mapping: {
        templateId,
        templateName: mapping.templateName,
        documentName: mapping.documentName,
        signersEmails: mapping.signersEmails,
        mappings: mapping.mappings as Record<string, string>,
      },
      safeUuid,
      webhookUrl,
      crm,
      signature,
      resolveSigners: (specs, crmData) =>
        resolveHubspotSignerEmails({
          accessToken,
          entityType,
          entityId: objectId,
          specs,
          crmData,
        }),
      auditActor: "hubspot-workflow",
    });

    return c.json({
      outputFields: {
        uuidDoc: result.uuidDoc,
        documentName: result.documentName,
        signers: result.signerEmails.join(", "),
      },
    });
  } catch (e) {
    if (e instanceof SendDocumentError) {
      return c.json({ error: e.message, ...e.meta }, e.httpStatus);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hubspot-workflow] erro:", msg);
    return c.json({ error: msg }, 502);
  }
}

type ExternalOptionsPayload = {
  origin?: { portalId?: number | string };
  fetchOptions?: { q?: string; after?: string };
};

/**
 * POST /hubspot/template-options
 * External options do dropdown de templates no Workflow Custom Action.
 * O HubSpot chama este endpoint quando o usuário configura a ação —
 * dispensa sincronização manual (diferente do robô Bitrix).
 */
export async function handleHubspotTemplateOptions(c: Context) {
  const rawBody = await c.req.text();

  const sigError = await verifySignature(c, rawBody);
  if (sigError) return sigError;

  let payload: ExternalOptionsPayload;
  try {
    payload = JSON.parse(rawBody) as ExternalOptionsPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const portalId =
    payload.origin?.portalId != null ? String(payload.origin.portalId) : null;
  if (!portalId) {
    return c.json({ options: [], after: null, searchable: false });
  }

  const resolved = await resolveTenantApp(portalId);
  if (!resolved) {
    return c.json({ options: [], after: null, searchable: false });
  }

  const mappings = await prisma.templateMapping.findMany({
    where: { appId: resolved.app.id },
    orderBy: { templateName: "asc" },
  });

  const q = payload.fetchOptions?.q?.toLowerCase().trim();
  const options = mappings
    .filter((m) => !q || m.templateName.toLowerCase().includes(q))
    .map((m) => ({
      label: m.templateName,
      description: m.documentName ?? undefined,
      value: m.templateId,
    }));

  return c.json({ options, after: null, searchable: true });
}
