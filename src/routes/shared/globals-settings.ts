import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { getTenantIdFromQuery, resolveTenantApp } from "@/lib/tenant";

export type GlobalsSettings = {
  d4signDocumentStatusField: string | null;
  d4signDocumentAttachField: string | null;
};

// GET /api/settings/globals?memberId=
export async function handleGetGlobalsSettings(c: Context) {
  const memberId = getTenantIdFromQuery(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const app = resolved.app;

  const setting = await prisma.setting.findUnique({ where: { appId: app.id } });

  return c.json({
    d4signDocumentStatusField: setting?.d4signDocumentStatusField ?? null,
    d4signDocumentAttachField: setting?.d4signDocumentAttachField ?? null,
  } satisfies GlobalsSettings);
}

// PUT /api/settings/globals?memberId=
export async function handlePutGlobalsSettings(c: Context) {
  const memberId = getTenantIdFromQuery(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const body = await c.req.json<{
    d4signDocumentStatusField?: string | null;
    d4signDocumentAttachField?: string | null;
  }>();

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const app = resolved.app;

  const setting = await prisma.setting.upsert({
    where: { appId: app.id },
    create: {
      appId: app.id,
      d4signDocumentStatusField: body.d4signDocumentStatusField ?? null,
      d4signDocumentAttachField: body.d4signDocumentAttachField ?? null,
    },
    update: {
      ...(body.d4signDocumentStatusField !== undefined
        ? { d4signDocumentStatusField: body.d4signDocumentStatusField || null }
        : {}),
      ...(body.d4signDocumentAttachField !== undefined
        ? { d4signDocumentAttachField: body.d4signDocumentAttachField || null }
        : {}),
    },
  });

  return c.json({
    d4signDocumentStatusField: setting.d4signDocumentStatusField,
    d4signDocumentAttachField: setting.d4signDocumentAttachField,
  });
}
