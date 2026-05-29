const DEFAULT_BASE = "https://secure.d4sign.com.br/api/v1";

export type D4SignClientConfig = {
  tokenApi: string;
  cryptKey?: string | null;
  baseUrl?: string;
};

function buildUrl(
  path: string,
  config: D4SignClientConfig,
  extra?: Record<string, string>,
): string {
  const base = (config.baseUrl ?? process.env.D4SIGN_API_BASE_URL ?? DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("tokenAPI", config.tokenApi);
  if (config.cryptKey) url.searchParams.set("cryptKey", config.cryptKey);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function d4signPing(config: D4SignClientConfig): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  try {
    const res = await fetch(buildUrl("/account", config), {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: t.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function d4signListSafes(config: D4SignClientConfig): Promise<unknown> {
  const res = await fetch(buildUrl("/safes", config), { cache: "no-store" });
  if (!res.ok) throw new Error(`D4Sign safes: HTTP ${res.status}`);
  return res.json();
}
