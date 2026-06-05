import { bitrixRestPostForm, refreshBitrixToken } from "@/lib/bitrix/bitrix24";
import type { AppAuth } from "@/lib/bitrix/bitrix24";
import { prisma } from "@/lib/db";

export function bitrixApiError(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as { error?: string; error_description?: string };
  if (r.error) return `${r.error}${r.error_description ? `: ${r.error_description}` : ""}`;
  return null;
}

/** Renova token Bitrix e persiste no banco quando possível. */
export async function resolveBitrixAccessToken(auth: AppAuth & { appId: string }): Promise<string> {
  let accessToken = auth.accessToken;
  const tok = await refreshBitrixToken({
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    refreshToken: auth.refreshToken,
  });
  if (tok?.access_token) {
    accessToken = tok.access_token;
    await prisma.coreCredential.update({
      where: { appId: auth.appId },
      data: {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? auth.refreshToken,
      },
    });
  }
  return accessToken;
}

export async function bitrixUpdateCrmEntity(
  domain: string,
  accessToken: string,
  entityType: string,
  entityId: string,
  fields: Record<string, unknown>,
): Promise<unknown> {
  const method = entityType === "lead" ? "crm.lead.update" : "crm.deal.update";
  console.log("[webhook-d4sign] bitrix update:", {
    method,
    entityId,
    fieldKeys: Object.keys(fields),
  });
  const res = await bitrixRestPostForm(domain, accessToken, method, {
    id: entityId,
    fields,
  });
  const err = bitrixApiError(res);
  if (err) {
    console.error("[webhook-d4sign] bitrix update erro:", err, JSON.stringify(res).slice(0, 500));
    throw new Error(err);
  }
  console.log("[webhook-d4sign] bitrix update ok:", JSON.stringify(res).slice(0, 300));
  return res;
}
