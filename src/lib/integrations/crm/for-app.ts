import type { CoreApp, CoreCredential, CoreDomain } from "@/generated/prisma/client";
import { resolveBitrixAccessToken } from "@/lib/bitrix/crm-update";
import { ensureValidHubspotAccessToken } from "@/lib/hubspot/access-token";
import { toAppAuth } from "@/lib/tenant";
import { createBitrixCrmAdapter } from "./bitrix-adapter";
import { createHubspotCrmAdapter } from "./hubspot-adapter";
import type { ICrmAdapter } from "./types";

type AppWithDomain = CoreApp & {
  domain: CoreDomain;
  credentials: CoreCredential | null;
};

/**
 * Cria o adapter CRM para um app já carregado do banco, resolvendo
 * o access token da plataforma (refresh automático quando expirado).
 */
export async function createCrmAdapterForApp(
  app: AppWithDomain,
): Promise<ICrmAdapter | null> {
  switch (app.domain.platform) {
    case "BITRIX24": {
      if (!app.credentials) return null;
      const auth = toAppAuth(app.domain, app.credentials);
      const accessToken = await resolveBitrixAccessToken({
        ...auth,
        appId: app.id,
      });
      return createBitrixCrmAdapter(app.domain.name, accessToken);
    }
    case "HUBSPOT": {
      if (!app.credentials) return null;
      const accessToken = await ensureValidHubspotAccessToken({
        appId: app.id,
        clientId: app.credentials.clientId,
        clientSecret: app.credentials.clientSecret,
        accessToken: app.credentials.accessToken,
        refreshToken: app.credentials.refreshToken,
        expiresAt: app.credentials.expiresAt,
      });
      if (!accessToken) return null;
      return createHubspotCrmAdapter(accessToken);
    }
    default:
      return null;
  }
}
