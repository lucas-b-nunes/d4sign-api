const HUBSPOT_API_BASE = "https://api.hubapi.com";

export class HubspotApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HubspotApiError";
  }
}

async function hubspotFetch<T = unknown>(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubspotApiError(
      res.status,
      `HubSpot ${method} ${path}: HTTP ${res.status} — ${text.slice(0, 300)}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function hubspotGet<T = unknown>(accessToken: string, path: string) {
  return hubspotFetch<T>(accessToken, "GET", path);
}

export function hubspotPost<T = unknown>(
  accessToken: string,
  path: string,
  body: unknown,
) {
  return hubspotFetch<T>(accessToken, "POST", path, body);
}

export function hubspotPatch<T = unknown>(
  accessToken: string,
  path: string,
  body: unknown,
) {
  return hubspotFetch<T>(accessToken, "PATCH", path, body);
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export type HubspotTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function hubspotTokenRequest(
  params: Record<string, string>,
): Promise<HubspotTokenResponse | null> {
  const res = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[hubspot-oauth] token request falhou:", res.status, text.slice(0, 300));
    return null;
  }

  return res.json() as Promise<HubspotTokenResponse>;
}

export function exchangeHubspotCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<HubspotTokenResponse | null> {
  return hubspotTokenRequest({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
}

export function refreshHubspotToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<HubspotTokenResponse | null> {
  return hubspotTokenRequest({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
}

export type HubspotTokenInfo = {
  hub_id: number;
  hub_domain: string;
  user: string;
  scopes: string[];
};

/** Metadados do access token: portalId (hub_id), domínio e escopos. */
export async function getHubspotTokenInfo(
  accessToken: string,
): Promise<HubspotTokenInfo | null> {
  const res = await fetch(
    `${HUBSPOT_API_BASE}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json() as Promise<HubspotTokenInfo>;
}

// ---------------------------------------------------------------------------
// Files (upload de PDF assinado)
// ---------------------------------------------------------------------------

export type HubspotUploadedFile = { id: string; url: string };

/** Sobe um arquivo para o Files tool do HubSpot (acesso privado). */
export async function hubspotUploadFile(
  accessToken: string,
  fileName: string,
  base64: string,
  folderPath = "/d4sign",
): Promise<HubspotUploadedFile> {
  const buffer = Buffer.from(base64, "base64");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), fileName);
  form.append("folderPath", folderPath);
  form.append(
    "options",
    JSON.stringify({ access: "PRIVATE", overwrite: false }),
  );

  const res = await fetch(`${HUBSPOT_API_BASE}/files/v3/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubspotApiError(
      res.status,
      `HubSpot upload file: HTTP ${res.status} — ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}
