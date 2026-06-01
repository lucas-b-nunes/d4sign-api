import type { Context } from "hono";
import { findTenantByMemberId, getFirstApp } from "@/lib/tenant";
import { bitrixRestGet } from "@/lib/bitrix/bitrix24";
import { prisma } from "@/lib/db";
import { refreshBitrixToken } from "@/lib/bitrix/bitrix24";

export type DealField = {
  code: string;
  title: string;
  type: string;
};

export async function handleGetDealFields(c: Context) {
  const memberId = c.req.query("memberId");
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) return c.json({ error: "not_found" }, 404);

  const cred = app.credentials;
  if (!cred) return c.json({ error: "credentials_missing" }, 404);

  // Garantir token válido
  let accessToken = cred.accessToken ?? "";
  const tok = await refreshBitrixToken({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (tok?.access_token) {
    accessToken = tok.access_token;
    await prisma.coreCredential.update({
      where: { appId: app.id },
      data: {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? cred.refreshToken,
      },
    });
  }

  const result = (await bitrixRestGet(
    tenant!.name,
    accessToken,
    "crm.deal.fields",
  )) as { result?: Record<string, { title?: string; type?: string }> };

  const fields: DealField[] = Object.entries(result?.result ?? {})
    .map(([code, meta]) => ({
      code,
      title: meta?.title ?? code,
      type: meta?.type ?? "string",
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  return c.json({ fields });
}
