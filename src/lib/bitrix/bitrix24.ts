import qs from "qs";

export function cleanBitrixHost(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export type BitrixOAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires?: number;
  error?: string;
};

/** Shape necessário para fazer chamadas Bitrix REST e renovar OAuth. */
export type AppAuth = {
  /** Domínio Bitrix (ex.: xxx.bitrix24.com.br) — de CoreDomain.name */
  domain: string;
  /** Access token atual — de CoreCredential.accessToken */
  accessToken: string;
  /** Refresh token — de CoreCredential.refreshToken */
  refreshToken: string;
  /** OAuth clientId — de CoreCredential.clientId */
  clientId: string;
  /** OAuth clientSecret — de CoreCredential.clientSecret */
  clientSecret: string;
};

export async function refreshBitrixToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<BitrixOAuthTokenResponse | null> {
  const url = new URL("https://oauth.bitrix.info/oauth/token");
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("client_secret", params.clientSecret);
  url.searchParams.set("refresh_token", params.refreshToken);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as BitrixOAuthTokenResponse;
}

export async function bitrixRestGet(
  domain: string,
  auth: string,
  method: string,
  extraQuery?: Record<string, string | number | boolean | null | undefined>,
): Promise<unknown> {
  const url = new URL(
    `https://${cleanBitrixHost(domain)}/rest/${encodeURIComponent(method)}`,
  );
  url.searchParams.set("auth", auth);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  return res.json();
}

export async function bitrixRestPostForm(
  domain: string,
  auth: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const u = `https://${cleanBitrixHost(domain)}/rest/${encodeURIComponent(method)}`;
  const payload = { ...body, auth };
  const encoded = qs.stringify(payload, {
    allowDots: false,
    arrayFormat: "brackets",
    skipNulls: true,
  });
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encoded,
    cache: "no-store",
  });
  return res.json();
}

/** Tenta renovar o access token usando os dados de AppAuth.
 *  Não persiste no banco — o chamador decide se/como persiste. */
export async function refreshAndPersistToken(auth: AppAuth): Promise<{
  access_token: string;
  refresh_token: string;
} | null> {
  if (!auth.clientId || !auth.clientSecret) return null;
  const tok = await refreshBitrixToken({
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    refreshToken: auth.refreshToken,
  });
  if (!tok?.access_token) return null;
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? auth.refreshToken,
  };
}
