import { bitrixRestPostForm } from "@/lib/bitrix/bitrix24";
import type { AppAuth } from "@/lib/bitrix/bitrix24";
import { ensureValidAccessToken } from "@/lib/bitrix/access-token";
import { prisma } from "@/lib/db";

export function bitrixApiError(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as { error?: string; error_description?: string };
  if (r.error) return `${r.error}${r.error_description ? `: ${r.error_description}` : ""}`;
  return null;
}

/** Renova token Bitrix e persiste no banco quando expirado. */
export async function resolveBitrixAccessToken(
  auth: AppAuth & { appId: string; expiresAt?: Date },
): Promise<string> {
  const cred = await prisma.coreCredential.findUnique({
    where: { appId: auth.appId },
  });
  if (!cred) return auth.accessToken;

  const token = await ensureValidAccessToken(cred);
  return token ?? auth.accessToken;
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
