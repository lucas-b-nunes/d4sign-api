import type { Context } from "hono";
import { prisma } from "@/lib/db";
import {
  getHubspotClientCredentials,
  getHubspotScopes,
  getPublicAppUrlFromRequest,
} from "@/lib/env";
import {
  exchangeHubspotCode,
  getHubspotTokenInfo,
} from "@/lib/hubspot/client";

function installFinishHtml(portalId: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Instalação D4Sign</title></head><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h3>Instalação concluída com sucesso</h3><p>Portal HubSpot: <strong>${portalId}</strong></p><p>Você já pode fechar esta janela e configurar a integração no painel D4Sign.</p></body></html>`;
}

function callbackUrl(c: Context): string {
  const base = getPublicAppUrlFromRequest(c.req.raw).replace(/\/$/, "");
  return `${base}/hubspot/oauth/callback`;
}

/** GET /hubspot/oauth — redireciona para a tela de autorização do HubSpot. */
export async function handleHubspotOAuthStart(c: Context) {
  const { clientId } = getHubspotClientCredentials();
  if (!clientId) {
    return c.json({ error: "HUBSPOT_CLIENT_ID não configurado" }, 500);
  }

  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(c));
  url.searchParams.set("scope", getHubspotScopes());

  return c.redirect(url.toString(), 302);
}

/** GET /hubspot/oauth/callback — troca o code por tokens e cria o tenant. */
export async function handleHubspotOAuthCallback(c: Context) {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "code required" }, 400);
  }

  const { clientId, clientSecret } = getHubspotClientCredentials();
  if (!clientId || !clientSecret) {
    return c.json({ error: "HUBSPOT_CLIENT_ID/SECRET não configurados" }, 500);
  }

  const tokens = await exchangeHubspotCode({
    clientId,
    clientSecret,
    redirectUri: callbackUrl(c),
    code,
  });
  if (!tokens) {
    return c.json({ error: "oauth_exchange_failed" }, 502);
  }

  const info = await getHubspotTokenInfo(tokens.access_token);
  if (!info) {
    return c.json({ error: "token_info_failed" }, 502);
  }

  const portalId = String(info.hub_id);
  const domainName = info.hub_domain || `${portalId}.hubspot.com`;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const appCode = `hubspot:${clientId}`;

  // 1. App code do app HubSpot
  const coreAppCode = await prisma.coreAppCode.upsert({
    where: { code: appCode },
    create: {
      code: appCode,
      name: "D4Sign HubSpot",
      secret: clientSecret,
    },
    update: { secret: clientSecret },
  });

  // 2. Tenant (portal HubSpot)
  const coreDomain = await prisma.coreDomain.upsert({
    where: { name: domainName },
    create: {
      name: domainName,
      memberId: portalId,
      platform: "HUBSPOT",
    },
    update: {
      memberId: portalId,
      platform: "HUBSPOT",
    },
  });

  // 3. App instalado
  const coreApp = await prisma.coreApp.upsert({
    where: {
      domainId_appCodeId: {
        domainId: coreDomain.id,
        appCodeId: coreAppCode.id,
      },
    },
    create: {
      domainId: coreDomain.id,
      appCodeId: coreAppCode.id,
      email: info.user || null,
      status: "ACTIVE",
    },
    update: {
      email: info.user || undefined,
      status: "ACTIVE",
    },
  });

  // 4. Credenciais OAuth
  await prisma.coreCredential.upsert({
    where: { appId: coreApp.id },
    create: {
      appId: coreApp.id,
      clientId,
      clientSecret,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
    update: {
      clientId,
      clientSecret,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
  });

  // 5. Setting vazio (preenchido depois pelo painel)
  await prisma.setting.upsert({
    where: { appId: coreApp.id },
    create: { appId: coreApp.id },
    update: {},
  });

  await prisma.auditLog.create({
    data: {
      appId: coreApp.id,
      actor: "hubspot-oauth",
      action: "app_installed",
      meta: { portalId, domain: domainName, scopes: info.scopes },
    },
  });

  console.log("[hubspot-install] app instalado:", { portalId, domain: domainName });
  return c.html(installFinishHtml(portalId), 200);
}
