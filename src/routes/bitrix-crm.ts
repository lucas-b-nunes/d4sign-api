import type { Context } from "hono";
import { findTenantByMemberId, getFirstApp, toAppAuth } from "@/lib/tenant";
import { bitrixRestGet, refreshBitrixToken } from "@/lib/bitrix/bitrix24";
import { prisma } from "@/lib/db";
import { ensureBizprocEnviarDocumento } from "@/lib/bitrix/bizproc-enviar-documento";

export type DealField = {
  code: string;
  title: string;
  type: string;
};

async function getValidAccessToken(app: ReturnType<typeof getFirstApp> & object) {
  const cred = (app as { credentials?: { appId: string; clientId: string; clientSecret: string; refreshToken: string; accessToken: string | null } }).credentials;
  if (!cred) return null;

  let accessToken = cred.accessToken ?? "";
  const tok = await refreshBitrixToken({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (tok?.access_token) {
    accessToken = tok.access_token;
    await prisma.coreCredential.update({
      where: { appId: cred.appId },
      data: {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? cred.refreshToken,
      },
    });
  }
  return accessToken;
}

export async function handleGetDealFields(c: Context) {
  const memberId = c.req.query("memberId");
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) return c.json({ error: "not_found" }, 404);

  if (!app.credentials) return c.json({ error: "credentials_missing" }, 404);

  const accessToken = await getValidAccessToken(app as never);
  if (!accessToken) return c.json({ error: "token_unavailable" }, 500);

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

// POST /api/bitrix/sync-robot?memberId=
// Atualiza as opções do select do robô BizProc com os templates já mapeados
export async function handleSyncRobot(c: Context) {
  const memberId = c.req.query("memberId");
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) return c.json({ error: "not_found" }, 404);

  if (!app.credentials) return c.json({ error: "credentials_missing" }, 404);

  const accessToken = await getValidAccessToken(app as never);
  if (!accessToken) return c.json({ error: "token_unavailable" }, 500);

  // Buscar todos os template mappings do app
  const mappings = await prisma.templateMapping.findMany({
    where: { appId: app.id },
    orderBy: { templateName: "asc" },
  });

  const templateOptions: Record<string, string> = {};
  for (const m of mappings) {
    templateOptions[m.templateId] = m.templateName;
  }

  const auth = toAppAuth(tenant!, app.credentials!);
  auth.accessToken = accessToken;

  try {
    const result = await ensureBizprocEnviarDocumento(auth, templateOptions);
    return c.json({
      ok: true,
      syncedTemplates: mappings.length,
      action: result.action,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-robot]", msg);
    return c.json({ error: msg }, 502);
  }
}
