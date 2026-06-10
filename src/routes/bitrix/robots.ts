import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { usePrismaticBridge } from "@/lib/feature-flags";
import {
  bitrixBizprocSendEvent,
  prismaticCancelarDocumento,
  prismaticEnviarDocumento,
  prismaticUpdateSubscriptionGroups,
} from "@/lib/integration/prismatic";
import { refreshBitrixToken } from "@/lib/bitrix/bitrix24";
import { resolveSignerEmails } from "@/lib/bitrix/resolve-signers";
import { findTenantByMemberId, findTenantByDomain, getFirstApp } from "@/lib/tenant";
import {
  extractAuth,
  extractAuthDomain,
  extractDocumentEntity,
  extractMemberId,
  extractTemplateId,
  parseBitrixRobotBody,
} from "@/lib/bitrix/parse-robot-body";
import { createBitrixCrmAdapter } from "@/lib/integrations/crm/bitrix-adapter";
import { createD4SignAdapter } from "@/lib/integrations/signature/d4sign-adapter";
import {
  SendDocumentError,
  sendDocumentFromTemplate,
} from "@/core/send-document";
import { getPublicAppUrl } from "@/lib/env";

function dataGet(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

async function parseRobotRequestBody(c: Context): Promise<Record<string, unknown>> {
  const contentType = c.req.header("content-type") ?? "";
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  return parseBitrixRobotBody(raw, contentType);
}

async function resolveTenantFromRobotBody(body: Record<string, unknown>) {
  const memberId = extractMemberId(body);
  if (memberId) {
    const tenant = await findTenantByMemberId(memberId);
    if (tenant) return { tenant, memberId };
  }

  const domain = extractAuthDomain(body);
  if (domain) {
    const tenant = await findTenantByDomain(domain);
    if (tenant) return { tenant, memberId: tenant.memberId };
  }

  return null;
}

function unauthorized(c: Context, error: string, meta?: Record<string, unknown>) {
  console.error("[enviar-documento] 401:", error, meta ?? {});
  return c.json({ error, ...meta }, 401);
}

function badRequest(c: Context, error: string, meta?: Record<string, unknown>) {
  console.error("[enviar-documento] 400:", error, meta ?? {});
  return c.json({ error, ...meta }, 400);
}

async function resolveAppByMemberId(memberId: string) {
  const tenant = await findTenantByMemberId(memberId);
  if (!tenant) return null;
  const app = getFirstApp(tenant);
  if (!app) return null;
  return { domain: tenant, app };
}

export async function handleEnviarDocumento(c: Context) {
  console.log("[enviar-documento] handler iniciado");
  let body: Record<string, unknown>;
  try {
    body = await parseRobotRequestBody(c);
  } catch {
    return badRequest(c, "invalid_body");
  }

  const resolvedTenant = await resolveTenantFromRobotBody(body);
  if (!resolvedTenant) {
    return unauthorized(c, "tenant_not_found", {
      hint: "Reinstale o app no Bitrix ou verifique se auth.member_id / auth.domain estÃ£o no payload.",
      hasAuth: Boolean(extractAuth(body)),
      domain: extractAuthDomain(body) ?? null,
    });
  }

  const { tenant: domain, memberId } = resolvedTenant;
  const app = getFirstApp(domain);
  if (!app) {
    return unauthorized(c, "app_not_found", { memberId });
  }

  const { entity, entityId } = extractDocumentEntity(body);
  const templateIdFromBody = extractTemplateId(body);

  console.log("[enviar-documento] parsed:", {
    memberId,
    entity,
    entityId,
    templateId: templateIdFromBody,
    hasAuth: Boolean(extractAuth(body)),
    domain: extractAuthDomain(body),
  });

  const urlKey = "urlEnviarDocumento";

  const instance = app.instance;

  if (usePrismaticBridge()) {
    if (!instance) return c.json({ error: "instance_missing" }, 500);
    try {
      await prismaticEnviarDocumento(urlKey, instance, {
        member_id: domain.memberId,
        domain: domain.name,
        entity,
        entity_id: entityId,
        props: dataGet(body, "properties"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 502);
    }
  } else {
    // Fluxo D4Sign nativo — orquestrado pelo pipeline universal (src/core)
    const d4cred = app.d4signCredential;
    if (!d4cred) {
      return c.json({ error: "d4sign_credentials_missing" }, 500);
    }

    const templateId = templateIdFromBody;

    if (!templateId) {
      return badRequest(c, "properties.template_id obrigatório", {
        properties: body.properties ?? null,
        hint: "Selecione um template no robô BizProc e sincronize em Operação → Templates.",
      });
    }

    const safeUuid = d4cred.defaultSafeUuid;
    if (!safeUuid) {
      return badRequest(c, "Cofre padrão não configurado. Acesse Configurações → Globais.");
    }

    // Buscar mapeamento do template (inclui documentName e signersEmails)
    const mapping = await prisma.templateMapping.findUnique({
      where: { appId_templateId: { appId: app.id, templateId } },
    });
    if (!mapping) {
      return badRequest(
        c,
        `Mapeamento do template "${templateId}" não encontrado. Configure em Operação → Templates.`,
        { templateId },
      );
    }

    // Obter access token válido (prioriza token enviado pelo Bitrix no auth)
    const cred = app.credentials;
    const authFromBody = extractAuth(body);
    let accessToken =
      typeof authFromBody?.access_token === "string"
        ? authFromBody.access_token
        : cred?.accessToken ?? "";
    if (cred) {
      const tok = await refreshBitrixToken({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
      });
      if (tok?.access_token) {
        accessToken = tok.access_token;
        await prisma.coreCredential.update({
          where: { appId: app.id },
          data: {
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token ?? cred.refreshToken,
          },
        });
      }
    }

    const crm = createBitrixCrmAdapter(domain.name, accessToken);
    const signature = createD4SignAdapter({
      tokenApi: d4cred.tokenApi,
      cryptKey: d4cred.cryptKey,
    });
    const webhookUrl = `${(getPublicAppUrl() ?? "").replace(/\/$/, "")}/api/webhooks/d4sign`;

    try {
      await sendDocumentFromTemplate({
        appId: app.id,
        entityType: entity,
        entityId,
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
          resolveSignerEmails({
            domain: domain.name,
            accessToken,
            entityType: entity,
            entityId,
            specs,
            crmData,
          }),
        auditActor: "bizproc",
      });
    } catch (e) {
      if (e instanceof SendDocumentError) {
        if (e.httpStatus === 400) {
          return badRequest(c, e.message, e.meta);
        }
        return c.json({ error: e.message, ...e.meta }, e.httpStatus);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 502);
    }
  }

  // Sinalizar o workflow Bitrix para continuar (USE_SUBSCRIPTION=Y)
  if (body.use_subscription === "Y") {
    const cred = app.credentials;
    if (cred) {
      const tok = await refreshBitrixToken({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
      });
      if (tok?.access_token) {
        await prisma.coreCredential.update({
          where: { appId: app.id },
          data: {
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token ?? cred.refreshToken,
          },
        });
      }

      const eventToken =
        typeof body.event_token === "string" ? body.event_token : undefined;
      if (eventToken) {
        const access = tok?.access_token ?? (cred.accessToken ?? "");
        await bitrixBizprocSendEvent(domain.name, access, eventToken);
      }
    }
  }

  return c.json({});
}

export async function handleCancelarDocumento(c: Context) {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (dataGet(body, "data.id") !== "cancelDocument") {
    return c.json({});
  }

  const auth = dataGet(body, "auth") as Record<string, unknown> | undefined;
  const memberId =
    auth && typeof auth.member_id === "string" ? auth.member_id : undefined;
  if (!memberId) {
    return c.json({ error: "UsuÃ¡rio nÃ£o encontrado" }, 401);
  }

  const resolved = await resolveAppByMemberId(memberId);
  if (!resolved) {
    return c.json({ error: "UsuÃ¡rio nÃ£o encontrado" }, 401);
  }
  const { domain, app } = resolved;

  const data = (dataGet(body, "data") as Record<string, unknown>) ?? {};
  const instance = app.instance;
  if (!instance) {
    return c.json({ error: "instance_missing" }, 500);
  }

  try {
    await prismaticCancelarDocumento(instance, {
      member_id: domain.memberId,
      domain: domain.name,
      user_id: auth?.user_id,
      document_key: data.documentKey,
      deal_id: data.dealId,
      api_token: data.apiToken,
      activity_id: data.activityId,
      origin_id: data.originId,
      logo_uri: data.logoUri,
    });
  } catch {
    return c.json({ error: "Erro ao cancelar documento" }, 500);
  }

  return c.json({});
}

type SaveBody = {
  groups?: string;
  verify_settings?: string;
  deal_settings?: string;
  fields?: string;
  contact_settings?: string;
  url_enviar_documento?: string;
  url_enviar_documento_envelope?: string;
  url_cancelar_documento?: string;
  url_update_subscription_groups?: string;
};

export async function handleSaveSettings(c: Context) {
  const id = c.req.param("id");
  if (!id?.trim()) {
    return c.json({ error: "invalid_id" }, 400);
  }

  // id agora Ã© core_apps.id
  const app = await prisma.coreApp.findUnique({
    where: { id },
    include: { domain: true },
  });
  if (!app) {
    return c.json({ error: "not_found" }, 404);
  }

  const body = await c.req.json<SaveBody>();

  const setting = await prisma.setting.upsert({
    where: { appId: id },
    create: { appId: id },
    update: {},
  });
  await prisma.setting.update({
    where: { appId: id },
    data: {
      ...(body.groups !== undefined ? { groups: body.groups } : {}),
      ...(body.verify_settings !== undefined
        ? { verifySettings: body.verify_settings }
        : {}),
      ...(body.deal_settings !== undefined
        ? { dealSettings: body.deal_settings }
        : {}),
      ...(body.fields !== undefined ? { fields: body.fields } : {}),
      ...(body.contact_settings !== undefined
        ? { contactSettings: body.contact_settings }
        : {}),
    },
  });

  const instancePatch: Record<string, string | null> = {};
  if (body.url_enviar_documento !== undefined)
    instancePatch.urlEnviarDocumento = body.url_enviar_documento || null;
  if (body.url_enviar_documento_envelope !== undefined)
    instancePatch.urlEnviarDocumentoEnvelope =
      body.url_enviar_documento_envelope || null;
  if (body.url_cancelar_documento !== undefined)
    instancePatch.urlCancelarDocumento = body.url_cancelar_documento || null;
  if (body.url_update_subscription_groups !== undefined)
    instancePatch.urlUpdateSubscriptionGroups =
      body.url_update_subscription_groups || null;

  if (Object.keys(instancePatch).length > 0) {
    await prisma.instance.upsert({
      where: { appId: id },
      create: { appId: id, ...instancePatch },
      update: instancePatch,
    });
  }

  const instance = await prisma.instance.findUnique({
    where: { appId: id },
  });

  if (instance) {
    await prismaticUpdateSubscriptionGroups(instance, app.domain.memberId, {
      domain_id: setting.appId,
      fields: body.fields ?? setting.fields,
      groups: body.groups ?? setting.groups,
      deal_settings: body.deal_settings ?? setting.dealSettings,
      verify_settings: body.verify_settings ?? setting.verifySettings,
      contact_settings: body.contact_settings ?? setting.contactSettings,
    });
  }

  return c.json({});
}
