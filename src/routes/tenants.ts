import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { findTenantByMemberId, getFirstApp } from "@/lib/tenant";

export async function handleResolveTenant(c: Context) {
  const domainName = c.req.query("domain");
  if (!domainName) {
    return c.json({ error: "domain required" }, 400);
  }
  const coreDomain = await prisma.coreDomain.findUnique({
    where: { name: domainName },
  });
  if (!coreDomain) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ memberId: coreDomain.memberId });
}

export async function handleGetTenant(c: Context) {
  const memberId = c.req.param("memberId");
  if (!memberId) {
    return c.json({ error: "member_id required" }, 400);
  }
  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!tenant || !app) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({
    id: tenant.id,
    domain: tenant.name,
    memberId: tenant.memberId,
    status: app.status,
    d4signConfigured: Boolean(app.d4signCredential),
    defaultSafeUuid: app.d4signCredential?.defaultSafeUuid ?? null,
    setting: app.setting
      ? {
          fields: app.setting.fields,
          groups: app.setting.groups,
          dealSettings: app.setting.dealSettings,
          verifySettings: app.setting.verifySettings,
          contactSettings: app.setting.contactSettings,
        }
      : null,
    instance: app.instance
      ? {
          urlEnviarDocumento: app.instance.urlEnviarDocumento,
          urlEnviarDocumentoEnvelope: app.instance.urlEnviarDocumentoEnvelope,
          urlCancelarDocumento: app.instance.urlCancelarDocumento,
          urlUpdateSubscriptionGroups: app.instance.urlUpdateSubscriptionGroups,
        }
      : null,
  });
}

export async function handleGetTenantDocuments(c: Context) {
  const memberId = c.req.param("memberId");
  if (!memberId) {
    return c.json({ error: "member_id required" }, 400);
  }
  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!tenant || !app) {
    return c.json({ error: "not_found" }, 404);
  }

  const documents = await prisma.document.findMany({
    where: { appId: app.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return c.json({
    documents: documents.map((d) => ({
      id: d.id,
      uuidDoc: d.uuidDoc,
      entityType: d.entityType,
      entityId: d.entityId,
      statusName: d.statusName,
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}
