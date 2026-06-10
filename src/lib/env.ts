/** OAuth Bitrix24 — BITRIX_APP_ID / BITRIX_APP_SECRET (ou BITRIX_CLIENT_*). */
export function getBitrixClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId:
      process.env.BITRIX_APP_ID ??
      process.env.BITRIX_CLIENT_ID ??
      "",
    clientSecret:
      process.env.BITRIX_APP_SECRET ??
      process.env.BITRIX_CLIENT_SECRET ??
      "",
  };
}

/** OAuth HubSpot — HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET. */
export function getHubspotClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: process.env.HUBSPOT_CLIENT_ID ?? "",
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
  };
}

/** Escopos OAuth solicitados na instalação do app HubSpot. */
export function getHubspotScopes(): string {
  return (
    process.env.HUBSPOT_SCOPES ??
    "crm.objects.deals.read crm.objects.deals.write crm.objects.contacts.read crm.objects.companies.read files oauth"
  );
}

/** URL pública HTTPS (ngrok) — install, event.bind, robôs. */
export function getPublicAppUrl(requestOrigin?: string): string {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    requestOrigin ??
    ""
  );
}

export function getPublicAppUrlFromRequest(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  let origin = url.origin;
  if (forwardedHost) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    origin = `${proto}://${forwardedHost.split(",")[0]?.trim()}`;
  }
  return getPublicAppUrl(origin);
}
