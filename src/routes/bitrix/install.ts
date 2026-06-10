import type { Context } from "hono";
import { getRequestFields, parseInstallFromFields } from "@/lib/request-fields";
import { getBitrixClientCredentials, getPublicAppUrlFromRequest } from "@/lib/env";
import { prisma } from "@/lib/db";
import { ensureBizprocEnviarDocumento } from "@/lib/bitrix/bizproc-enviar-documento";
import { ensureSignerContactField } from "@/lib/bitrix/create-fields";
import { bitrixEventBind, bitrixEventUnbind } from "@/lib/integration/prismatic";
import type { AppAuth } from "@/lib/bitrix/bitrix24";

function vendorsHtml() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Vendors</title></head><body><p>Vendors</p></body></html>`;
}

function installFinishHtml() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Instalação</title><script src="https://api.bitrix24.com/api/v1/"></script><script>BX24.installFinish();</script></head><body><h3>Instalação concluída com sucesso</h3></body></html>`;
}

export async function handleInstall(c: Context) {
  const req = c.req.raw;
  const url = new URL(req.url);
  const fields = await getRequestFields(req, url);
  const memberRaw =
    fields.get("member_id") ?? fields.get("memberId") ?? fields.get("MEMBER_ID");
  if (!memberRaw) {
    return c.html(vendorsHtml(), 200);
  }

  const params = parseInstallFromFields(fields);
  if (!params) {
    return c.json({ error: "missing_install_params" }, 400);
  }

  const { clientId, clientSecret } = getBitrixClientCredentials();
  const appCode = clientId || "d4sign";

  // 1. Upsert core_app_codes
  const coreAppCode = await prisma.coreAppCode.upsert({
    where: { code: appCode },
    create: {
      code: appCode,
      name: "D4Sign",
      secret: clientSecret || "",
    },
    update: {
      ...(clientSecret ? { secret: clientSecret } : {}),
    },
  });

  // 2. Upsert core_domains
  const coreDomain = await prisma.coreDomain.upsert({
    where: { name: params.domain },
    create: {
      name: params.domain,
      memberId: params.memberId,
      platform: "BITRIX24",
    },
    update: {
      memberId: params.memberId,
      platform: "BITRIX24",
    },
  });

  // 3. Upsert core_apps
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
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
    },
  });

  // 4. Upsert core_credentials
  await prisma.coreCredential.upsert({
    where: { appId: coreApp.id },
    create: {
      appId: coreApp.id,
      clientId: clientId || "",
      clientSecret: clientSecret || "",
      accessToken: params.authId,
      refreshToken: params.refreshId,
      expiresAt: params.expiresAt,
    },
    update: {
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      accessToken: params.authId,
      refreshToken: params.refreshId,
      expiresAt: params.expiresAt,
    },
  });

  // 5. Upsert Setting
  await prisma.setting.upsert({
    where: { appId: coreApp.id },
    create: { appId: coreApp.id },
    update: {},
  });

  // 6. Upsert Instance
  await prisma.instance.upsert({
    where: { appId: coreApp.id },
    create: { appId: coreApp.id },
    update: {},
  });

  const base = getPublicAppUrlFromRequest(req);
  if (!base) {
    return c.json({ error: "set_PUBLIC_APP_URL" }, 500);
  }

  const auth: AppAuth = {
    domain: coreDomain.name,
    accessToken: params.authId,
    refreshToken: params.refreshId,
    clientId: clientId || "",
    clientSecret: clientSecret || "",
  };

  // 7. Events, bizproc, signer field
  const cancelHandler = `${base.replace(/\/$/, "")}/bitrix/cancelar-documento`;
  await bitrixEventUnbind(
    auth.domain,
    auth.accessToken,
    "onCrmTimelineItemAction",
    cancelHandler,
  );
  await bitrixEventBind(
    auth.domain,
    auth.accessToken,
    "onCrmTimelineItemAction",
    cancelHandler,
  );

  // Buscar templates já mapeados para popular o select do robô
  const existingMappings = await prisma.templateMapping.findMany({
    where: { appId: coreApp.id },
    orderBy: { templateName: "asc" },
  });
  const templateOptions: Record<string, string> = {};
  for (const m of existingMappings) {
    templateOptions[m.templateId] = m.templateName;
  }

  await ensureBizprocEnviarDocumento(auth, templateOptions);
  await ensureSignerContactField(auth);

  return c.html(installFinishHtml(), 200);
}
