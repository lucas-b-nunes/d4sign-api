/** Coleta parâmetros Bitrix de query + body (fetch Request). */
export async function getRequestFields(
  req: Request,
  url: URL,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  url.searchParams.forEach((v, k) => {
    out.set(k, v);
  });

  const ct = req.headers.get("content-type") ?? "";

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    if (ct.includes("application/json")) {
      try {
        const body = (await req.clone().json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) {
          if (v != null && typeof v !== "object") out.set(k, String(v));
        }
      } catch {
        /* ignore */
      }
    } else if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("multipart/form-data")
    ) {
      const fd = await req.clone().formData();
      fd.forEach((v, k) => {
        if (typeof v === "string" && v) out.set(k, v);
      });
    }
  }

  return out;
}

export type BitrixInstallParams = {
  domain: string;
  memberId: string;
  authId: string;
  refreshId: string;
  expiresAt: Date;
};

export function parseInstallFromFields(
  fields: Map<string, string>,
): BitrixInstallParams | null {
  const get = (keys: string[]) => {
    for (const k of keys) {
      const v = fields.get(k);
      if (v) return v;
    }
    return undefined;
  };

  const domain = get(["DOMAIN", "domain"]);
  const memberId = get(["member_id", "memberId", "MEMBER_ID"]);
  const authId = get(["AUTH_ID", "auth_id", "token"]);
  const refreshId = get(["REFRESH_ID", "refresh_id"]);
  const authExpiresRaw = get(["AUTH_EXPIRES", "auth_expires", "expires"]);

  if (!domain || !memberId || !authId || !refreshId) return null;

  const ms = authExpiresRaw ? Number.parseInt(authExpiresRaw, 10) : 0;
  const expiresAt = new Date(Date.now() + (Number.isFinite(ms) ? ms : 0));

  return {
    domain,
    memberId,
    authId,
    refreshId,
    expiresAt,
  };
}
