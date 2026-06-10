import { CRM_PLATFORM, type CrmPlatform } from "@/lib/platform";
import { createBitrixCrmAdapter } from "./bitrix-adapter";
import { createHubspotCrmAdapter } from "./hubspot-adapter";
import type { ICrmAdapter } from "./types";

/**
 * Cria o adapter CRM da plataforma do tenant.
 * `domain` é o host do portal (Bitrix) — ignorado pelo HubSpot (Bearer token).
 */
export function createCrmAdapter(
  platform: CrmPlatform | string,
  domain: string,
  accessToken: string,
): ICrmAdapter {
  switch (platform) {
    case CRM_PLATFORM.BITRIX24:
    case "BITRIX24":
      return createBitrixCrmAdapter(domain, accessToken);
    case CRM_PLATFORM.HUBSPOT:
    case "HUBSPOT":
      return createHubspotCrmAdapter(accessToken);
    default:
      throw new Error(`Plataforma CRM desconhecida: ${platform}`);
  }
}
