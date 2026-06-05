import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { d4signPing } from "@/lib/d4sign/client";
import { findTenantByMemberId, getFirstApp } from "@/lib/tenant";

export async function handleGetD4SignSettings(c: Context) {
  const memberId = c.req.query("member_id");
  if (!memberId) {
    return c.json({ error: "member_id required" }, 400);
  }

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) {
    return c.json({ error: "not_found" }, 404);
  }

  const cred = app.d4signCredential;
  return c.json({
    configured: Boolean(cred),
    tokenApi: cred?.tokenApi ?? null,
    cryptKey: cred?.cryptKey ?? null,
    hmacSecret: cred?.hmacSecret ?? null,
    defaultSafeUuid: cred?.defaultSafeUuid ?? null,
  });
}

export async function handlePutD4SignSettings(c: Context) {
  const memberId = c.req.query("member_id");
  if (!memberId) {
    return c.json({ error: "member_id required" }, 400);
  }

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) {
    return c.json({ error: "not_found" }, 404);
  }

  const body = await c.req.json<{
    tokenApi?: string;
    cryptKey?: string;
    hmacSecret?: string;
    defaultSafeUuid?: string;
  }>();

  if (!body.tokenApi?.trim()) {
    return c.json({ error: "tokenApi required" }, 400);
  }

  await prisma.d4SignCredential.upsert({
    where: { appId: app.id },
    create: {
      appId: app.id,
      tokenApi: body.tokenApi.trim(),
      cryptKey: body.cryptKey?.trim() || null,
      hmacSecret: body.hmacSecret?.trim() || null,
      defaultSafeUuid: body.defaultSafeUuid?.trim() || null,
    },
    update: {
      tokenApi: body.tokenApi.trim(),
      ...(body.cryptKey !== undefined
        ? { cryptKey: body.cryptKey.trim() || null }
        : {}),
      ...(body.hmacSecret !== undefined
        ? { hmacSecret: body.hmacSecret.trim() || null }
        : {}),
      ...(body.defaultSafeUuid !== undefined
        ? { defaultSafeUuid: body.defaultSafeUuid.trim() || null }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      appId: app.id,
      actor: "settings",
      action: "d4sign_credentials_updated",
    },
  });

  return c.json({ ok: true });
}

export async function handleTestD4SignSettings(c: Context) {
  const memberId = c.req.query("member_id");
  if (!memberId) {
    return c.json({ error: "member_id required" }, 400);
  }

  let body: { tokenApi?: string; cryptKey?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    /* stored */
  }

  const tenant = await findTenantByMemberId(memberId);
  const app = tenant ? getFirstApp(tenant) : null;
  if (!app) {
    return c.json({ error: "not_found" }, 404);
  }

  const tokenApi = body.tokenApi?.trim() || app.d4signCredential?.tokenApi;
  const cryptKey = body.cryptKey?.trim() ?? app.d4signCredential?.cryptKey;

  if (!tokenApi) {
    return c.json({ error: "tokenApi required" }, 400);
  }

  const result = await d4signPing({ tokenApi, cryptKey });
  return c.json(result, result.ok ? 200 : 502);
}
