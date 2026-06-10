import type { Context } from "hono";
import { getTenantIdFromQuery, resolveTenantApp, toAppAuth } from "@/lib/tenant";
import { ensureValidAccessToken } from "@/lib/bitrix/access-token";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { prisma } from "@/lib/db";
import { ensureBizprocEnviarDocumento } from "@/lib/bitrix/bizproc-enviar-documento";
import { createBitrixCrmAdapter } from "@/lib/integrations/crm/bitrix-adapter";

export type DealField = {
  code: string;
  title: string;
  type: string;
};

/** Campos de Deal mudam raramente — cache de 5 min por tenant. */
const dealFieldsCache = new TtlCache<DealField[]>(5 * 60 * 1000);

export async function handleGetDealFields(c: Context) {
  const memberId = getTenantIdFromQuery(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const cached = dealFieldsCache.get(memberId);
  if (cached) return c.json({ fields: cached });

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const { tenant, app } = resolved;

  if (!app.credentials) return c.json({ error: "credentials_missing" }, 404);

  const accessToken = await ensureValidAccessToken(app.credentials);
  if (!accessToken) return c.json({ error: "token_unavailable" }, 500);

  const crm = createBitrixCrmAdapter(tenant.name, accessToken);
  const properties = await crm.listEntityProperties("deal");

  const fields: DealField[] = properties.map((p) => ({
    code: p.fieldId,
    title: p.label,
    type: p.type,
  }));

  dealFieldsCache.set(memberId, fields);
  return c.json({ fields });
}

// POST /api/bitrix/sync-robot?memberId=
// Atualiza as opções do select do robô BizProc com os templates já mapeados
export async function handleSyncRobot(c: Context) {
  const memberId = getTenantIdFromQuery(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const { tenant, app } = resolved;

  if (!app.credentials) return c.json({ error: "credentials_missing" }, 404);

  const accessToken = await ensureValidAccessToken(app.credentials);
  if (!accessToken) return c.json({ error: "token_unavailable" }, 500);

  // Buscar todos os template mappings do app
  const mappings = await prisma.templateMapping.findMany({
    where: { appId: app.id },
    orderBy: { templateName: "asc" },
  });

  const templateOptions: Record<string, string> = {};
  for (const m of mappings) {
    templateOptions[m.templateId] = m.templateName;
  }

  const auth = toAppAuth(tenant, app.credentials);
  auth.accessToken = accessToken;

  try {
    const result = await ensureBizprocEnviarDocumento(auth, templateOptions);
    return c.json({
      ok: true,
      syncedTemplates: mappings.length,
      action: result.action,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-robot]", msg);
    return c.json({ error: msg }, 502);
  }
}
