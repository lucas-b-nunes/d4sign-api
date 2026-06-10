import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { getTenantIdFromQuery, resolveTenantApp } from "@/lib/tenant";
import { TtlCache } from "@/lib/cache/ttl-cache";
import {
  d4signListSafes,
  d4signListTemplates,
  type D4SignTemplate,
} from "@/lib/d4sign/client";
import { isValidSignerSpec } from "@/lib/signer-spec";

/** Templates D4Sign mudam raramente durante uma sessão de configuração. */
const templatesCache = new TtlCache<D4SignTemplate[]>(2 * 60 * 1000);
const safesCache = new TtlCache<Awaited<ReturnType<typeof d4signListSafes>>>(2 * 60 * 1000);

function getMemberId(c: Context): string | null {
  return getTenantIdFromQuery(c);
}

async function resolveAppAndCreds(memberId: string) {
  const resolved = await resolveTenantApp(memberId);
  if (!resolved?.app.d4signCredential) return null;
  return { app: resolved.app, creds: resolved.app.d4signCredential };
}

// GET /api/d4sign/safes?memberId=
export async function handleListSafes(c: Context) {
  const memberId = getMemberId(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const resolved = await resolveAppAndCreds(memberId);
  if (!resolved) return c.json({ error: "not_found_or_no_credentials" }, 404);

  const cacheKey = resolved.app.id;
  const cachedSafes = safesCache.get(cacheKey);
  const safes =
    cachedSafes ??
    (await d4signListSafes({
      tokenApi: resolved.creds.tokenApi,
      cryptKey: resolved.creds.cryptKey,
    }));
  if (!cachedSafes) safesCache.set(cacheKey, safes);

  return c.json({ safes, currentSafeUuid: resolved.creds.defaultSafeUuid ?? null });
}

// PUT /api/d4sign/safes/default?memberId=
// body: { safeUuid: string }
export async function handleSetDefaultSafe(c: Context) {
  const memberId = getMemberId(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const body = await c.req.json<{ safeUuid: string }>();
  if (!body.safeUuid) return c.json({ error: "safeUuid required" }, 400);

  const resolved = await resolveAppAndCreds(memberId);
  if (!resolved) return c.json({ error: "not_found_or_no_credentials" }, 404);

  await prisma.d4SignCredential.update({
    where: { appId: resolved.app.id },
    data: { defaultSafeUuid: body.safeUuid },
  });

  return c.json({ ok: true });
}

// GET /api/d4sign/templates?memberId=
export async function handleListTemplates(c: Context) {
  const memberId = getMemberId(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const resolved = await resolveAppAndCreds(memberId);
  if (!resolved) return c.json({ error: "not_found_or_no_credentials" }, 404);

  const cacheKey = resolved.app.id;
  const cached = templatesCache.get(cacheKey);
  if (cached) return c.json({ templates: cached });

  const raw = await d4signListTemplates({
    tokenApi: resolved.creds.tokenApi,
    cryptKey: resolved.creds.cryptKey,
  });

  // Normalizar para array
  const templates = Object.values(raw as Record<string, D4SignTemplate>);
  templatesCache.set(cacheKey, templates);
  return c.json({ templates });
}

// GET /api/d4sign/template-mappings?memberId=
export async function handleGetTemplateMappings(c: Context) {
  const memberId = getMemberId(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);

  const mappings = await prisma.templateMapping.findMany({
    where: { appId: resolved.app.id },
    orderBy: { templateName: "asc" },
  });

  return c.json({ mappings });
}

// PUT /api/d4sign/template-mappings/:templateId?memberId=
// body: { templateName: string; mappings: Record<string, string> }
export async function handleUpsertTemplateMapping(c: Context) {
  const memberId = getMemberId(c);
  if (!memberId) return c.json({ error: "memberId required" }, 400);

  const templateId = c.req.param("templateId");
  if (!templateId) return c.json({ error: "templateId required" }, 400);

  const body = await c.req.json<{
    templateName: string;
    mappings: Record<string, string>;
    documentName?: string;
    signersEmails?: string[];
  }>();

  if (!body.templateName) return c.json({ error: "templateName required" }, 400);

  if (body.signersEmails !== undefined) {
    if (!Array.isArray(body.signersEmails)) {
      return c.json({ error: "signersEmails must be an array" }, 400);
    }
    for (const spec of body.signersEmails) {
      if (typeof spec !== "string" || !isValidSignerSpec(spec)) {
        return c.json(
          { error: `Signatário inválido: ${String(spec)}. Use e-mail, {=Contact:all} ou {=Document:CAMPO}.` },
          400,
        );
      }
    }
  }

  const resolved = await resolveTenantApp(memberId);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const app = resolved.app;

  const mapping = await prisma.templateMapping.upsert({
    where: { appId_templateId: { appId: app.id, templateId } },
    create: {
      appId: app.id,
      templateId,
      templateName: body.templateName,
      mappings: body.mappings,
      documentName: body.documentName ?? null,
      signersEmails: body.signersEmails ?? [],
    },
    update: {
      templateName: body.templateName,
      mappings: body.mappings,
      ...(body.documentName !== undefined ? { documentName: body.documentName } : {}),
      ...(body.signersEmails !== undefined ? { signersEmails: body.signersEmails } : {}),
    },
  });

  return c.json({ mapping });
}
