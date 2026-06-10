import type { Context } from "hono";
import { getTenantIdFromQuery, resolveTenantApp } from "@/lib/tenant";
import { ensureValidHubspotAccessToken } from "@/lib/hubspot/access-token";
import { createHubspotCrmAdapter } from "@/lib/integrations/crm/hubspot-adapter";
import { TtlCache } from "@/lib/cache/ttl-cache";

export type DealField = {
  code: string;
  title: string;
  type: string;
};

/** Properties de Deal mudam raramente — cache de 5 min por tenant. */
const dealPropertiesCache = new TtlCache<DealField[]>(5 * 60 * 1000);

/**
 * GET /api/hubspot/deal-properties?portalId=
 * Mesmo formato de resposta de /api/bitrix/deal-fields — frontends reutilizam
 * o editor de mapeamento sem mudanças.
 */
export async function handleGetHubspotDealProperties(c: Context) {
  const portalId = getTenantIdFromQuery(c);
  if (!portalId) return c.json({ error: "portalId required" }, 400);

  const cached = dealPropertiesCache.get(portalId);
  if (cached) return c.json({ fields: cached });

  const resolved = await resolveTenantApp(portalId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const { app } = resolved;

  if (!app.credentials) return c.json({ error: "credentials_missing" }, 404);

  const accessToken = await ensureValidHubspotAccessToken({
    appId: app.id,
    clientId: app.credentials.clientId,
    clientSecret: app.credentials.clientSecret,
    accessToken: app.credentials.accessToken,
    refreshToken: app.credentials.refreshToken,
    expiresAt: app.credentials.expiresAt,
  });
  if (!accessToken) return c.json({ error: "token_unavailable" }, 500);

  const crm = createHubspotCrmAdapter(accessToken);
  const properties = await crm.listEntityProperties("deal");

  const fields: DealField[] = properties.map((p) => ({
    code: p.fieldId,
    title: p.label,
    type: p.type,
  }));

  dealPropertiesCache.set(portalId, fields);
  return c.json({ fields });
}
