import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { usePrismaticBridge } from "@/lib/feature-flags";
import {
  bitrixBizprocSendEvent,
  prismaticCancelarDocumento,
  prismaticEnviarDocumento,
  prismaticUpdateSubscriptionGroups,
} from "@/lib/integration/prismatic";
import { refreshBitrixToken, bitrixRestGet } from "@/lib/bitrix/bitrix24";
import { findTenantByMemberId, getFirstApp, toAppAuth } from "@/lib/tenant";
import {
  d4signBuildFromTemplate,
  d4signConfigureWebhook,
  d4signAddSigners,
  d4signSendToSigner,
  type D4SignClientConfig,
} from "@/lib/d4sign/client";
import { getPublicAppUrl } from "@/lib/env";

const FLOWS: Record<string, "urlEnviarDocumentoEnvelope" | "urlEnviarDocumento"> =
  {
    Y: "urlEnviarDocumentoEnvelope",
    N: "urlEnviarDocumento",
  };

function dataGet(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

async function resolveAppByMemberId(memberId: string) {
  const tenant = await findTenantByMemberId(memberId);
  if (!tenant) return null;
  const app = getFirstApp(tenant);
  if (!app) return null;
  return { domain: tenant, app };
}

/** Busca campos de uma entidade CRM no Bitrix (deal ou lead) */
async function fetchCrmEntity(
  domain: string,
  accessToken: string,
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown>> {
  const method = entityType === "lead" ? "crm.lead.get" : "crm.deal.get";
  const result = (await bitrixRestGet(domain, accessToken, method, {
    id: entityId,
  })) as { result?: Record<string, unknown> };
  return result?.result ?? {};
}

/**
 * Resolve as variáveis do template substituindo caminhos de campo CRM pelos valores reais.
 * mappings: { "nome_completo": "CONTACT_NAME", "razao_social": "COMPANY_TITLE" }
 * crmData: campos da entidade Bitrix
 */
function resolveTemplateVariables(
  mappings: Record<string, string>,
  crmData: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [templateVar, crmField] of Object.entries(mappings)) {
    const value = crmData[crmField];
    result[templateVar] = value != null ? String(value) : "";
  }
  return result;
}

export async function handleEnviarDocumento(c: Context) {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const auth = dataGet(body, "auth") as Record<string, unknown> | undefined;
  const memberId =
    auth && typeof auth.member_id === "string" ? auth.member_id : undefined;
  if (!memberId) {
    return c.json({ error: "missing_auth.member_id" }, 401);
  }

  const resolved = await resolveAppByMemberId(memberId);
  if (!resolved) {
    return c.json({ error: "Usuário não encontrado" }, 401);
  }
  const { domain, app } = resolved;

  const envelopeRaw = dataGet(body, "properties.envelope");
  const envelope =
    envelopeRaw === "Y" || envelopeRaw === "N" ? String(envelopeRaw) : "N";
  const urlKey = FLOWS[envelope] ?? "urlEnviarDocumento";

  const docId = body.document_id;
  let entity = "deal";
  let entityId = "0";
  if (Array.isArray(docId) && docId[2] != null) {
    const parts = String(docId[2]).split("_");
    entity = parts[0] ?? "deal";
    entityId = parts[1] ?? "0";
  }

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
    // Fluxo D4Sign nativo
    const d4cred = app.d4signCredential;
    if (!d4cred) {
      return c.json({ error: "d4sign_credentials_missing" }, 500);
    }

    const templateId = dataGet(body, "properties.template_id");
    const signersEmailsRaw = dataGet(body, "properties.signers_emails");
    const documentName =
      (dataGet(body, "properties.document_name") as string | undefined) ??
      `Documento ${entity} ${entityId}`;

    if (!templateId || typeof templateId !== "string") {
      return c.json({ error: "properties.template_id obrigatório" }, 400);
    }

    const safeUuid = d4cred.defaultSafeUuid;
    if (!safeUuid) {
      return c.json({ error: "Cofre padrão não configurado. Acesse Configurações → Globais." }, 400);
    }

    // Buscar mapeamento do template
    const mapping = await prisma.templateMapping.findUnique({
      where: { appId_templateId: { appId: app.id, templateId } },
    });
    if (!mapping) {
      return c.json({
        error: `Mapeamento do template "${templateId}" não encontrado. Configure em Operação → Templates.`,
      }, 400);
    }

    // Obter access token válido
    const cred = app.credentials;
    let accessToken = cred?.accessToken ?? "";
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

    // Buscar dados da entidade CRM
    const crmData = await fetchCrmEntity(domain.name, accessToken, entity, entityId);

    // Resolver variáveis do template a partir do mapeamento salvo
    const rawMappings = mapping.mappings as Record<string, string>;
    const resolvedVars = resolveTemplateVariables(rawMappings, crmData);

    // Montar payload do template (separar preenchedor dos tokens_gerais se necessário)
    const templatePayload: Record<string, unknown> = { ...resolvedVars };

    const d4config: D4SignClientConfig = {
      tokenApi: d4cred.tokenApi,
      cryptKey: d4cred.cryptKey,
    };

    let uuidDoc: string;
    try {
      const buildResult = await d4signBuildFromTemplate(
        d4config,
        safeUuid,
        documentName,
        { [templateId]: templatePayload },
      );
      uuidDoc = buildResult.uuid;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.auditLog.create({
        data: { appId: app.id, actor: "bizproc", action: "d4sign_build_error", meta: { error: msg, entity, entity_id: entityId } },
      });
      return c.json({ error: `Erro ao criar documento: ${msg}` }, 502);
    }

    // Configurar webhook no documento
    const webhookUrl = `${(getPublicAppUrl() ?? "").replace(/\/$/, "")}/api/webhooks/d4sign`;
    try {
      await d4signConfigureWebhook(d4config, uuidDoc, webhookUrl);
    } catch {
      // Não fatal — continua o fluxo
    }

    // Adicionar signatários
    const emails: string[] =
      typeof signersEmailsRaw === "string"
        ? signersEmailsRaw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

    if (emails.length > 0) {
      const signers = emails.map((email) => ({
        email,
        act: "1",
        foreign: "0",
        certificadoicpbr: "0",
        assinatura_presencial: "0",
      }));
      try {
        await d4signAddSigners(d4config, uuidDoc, signers);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: `Erro ao adicionar signatários: ${msg}` }, 502);
      }

      // Enviar para assinar
      try {
        await d4signSendToSigner(d4config, uuidDoc);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: `Erro ao enviar para assinatura: ${msg}` }, 502);
      }
    }

    // Persistir documento no banco
    await prisma.document.upsert({
      where: { uuidDoc },
      create: { appId: app.id, uuidDoc, entityType: entity, entityId, statusName: "Aguardando Assinaturas", statusId: 3 },
      update: { statusName: "Aguardando Assinaturas", statusId: 3 },
    });

    await prisma.auditLog.create({
      data: {
        appId: app.id,
        actor: "bizproc",
        action: "enviar_documento_d4sign",
        meta: { uuidDoc, entity, entity_id: entityId, templateId },
      },
    });
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
    return c.json({ error: "Usuário não encontrado" }, 401);
  }

  const resolved = await resolveAppByMemberId(memberId);
  if (!resolved) {
    return c.json({ error: "Usuário não encontrado" }, 401);
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

  // id agora é core_apps.id
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
