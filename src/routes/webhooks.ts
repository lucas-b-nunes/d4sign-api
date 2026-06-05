import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { verifyD4SignWebhookHmac } from "@/lib/d4sign/webhook-hmac";
import {
  extractWebhookUuid,
  extractTypePost,
  normalizeD4SignWebhookBody,
  parseD4SignWebhookText,
} from "@/lib/d4sign/parse-webhook-body";
import { processD4SignWebhook } from "@/lib/d4sign/process-webhook";

async function readWebhookBody(c: Context): Promise<Record<string, unknown>> {
  const contentType = c.req.header("content-type") ?? "";

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const parsed = await c.req.parseBody();
    return normalizeD4SignWebhookBody(parsed as Record<string, unknown>);
  }

  const text = await c.req.text();
  return parseD4SignWebhookText(text, contentType);
}

export async function handleD4SignWebhook(c: Context) {
  let body: Record<string, unknown>;
  try {
    body = await readWebhookBody(c);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webhook-d4sign] falha ao parsear body:", msg);
    return c.json({ error: "invalid_body" }, 400);
  }

  console.log("[webhook-d4sign] payload recebido:", JSON.stringify(body, null, 2));

  const uuidDoc = extractWebhookUuid(body);
  const contentHmac = c.req.header("content-hmac") ?? c.req.header("Content-Hmac");

  console.log("[webhook-d4sign] headers:", {
    contentType: c.req.header("content-type"),
    contentHmac: contentHmac ? `${contentHmac.slice(0, 20)}...` : null,
    type_post: extractTypePost(body),
    uuidDoc,
  });

  let verified = false;
  let appId: string | null = null;
  let processingError: string | null = null;
  let bitrixUpdated = false;

  const doc = uuidDoc
    ? await prisma.document.findUnique({
        where: { uuidDoc },
        include: {
          app: {
            include: {
              domain: true,
              credentials: true,
              setting: true,
              d4signCredential: true,
            },
          },
        },
      })
    : null;

  if (doc) {
    appId = doc.appId;
    const secret = doc.app.d4signCredential?.hmacSecret;
    if (secret) {
      verified = verifyD4SignWebhookHmac(uuidDoc!, secret, contentHmac ?? null);
      console.log("[webhook-d4sign] HMAC verificado:", verified);
      if (!verified) {
        console.warn("[webhook-d4sign] HMAC inválido — sync Bitrix bloqueado");
      }
    } else {
      console.warn("[webhook-d4sign] hmacSecret não configurado — sync Bitrix permitido sem verificação");
      verified = false;
    }
  } else {
    console.warn("[webhook-d4sign] documento não encontrado no banco:", uuidDoc ?? "(sem uuid)");
  }

  const webhookLog = await prisma.webhookLog.create({
    data: {
      appId,
      bodyJson: body as object,
      verified,
      headersHash: contentHmac?.slice(0, 128) ?? null,
    },
  });

  if (doc && uuidDoc) {
    const secret = doc.app.d4signCredential?.hmacSecret;
    const maySync = !secret || verified;

    if (maySync) {
      try {
        const result = await processD4SignWebhook(doc, body);
        bitrixUpdated = result.bitrixUpdated;

        await prisma.document.update({
          where: { uuidDoc },
          data: {
            rawLastPayload: body as object,
            statusName: result.statusName,
            statusId: result.statusId || undefined,
          },
        });

        await prisma.auditLog.create({
          data: {
            appId: doc.appId,
            actor: "webhook",
            action: "d4sign_webhook_processed",
            meta: {
              uuidDoc,
              type_post: extractTypePost(body),
              statusName: result.statusName,
              bitrixUpdated,
            },
          },
        });

        console.log("[webhook-d4sign] processamento ok:", {
          uuidDoc,
          statusName: result.statusName,
          bitrixUpdated,
        });
      } catch (e) {
        processingError = e instanceof Error ? e.message : String(e);
        console.error("[webhook-d4sign] erro no processamento:", processingError);

        await prisma.document.update({
          where: { uuidDoc },
          data: { rawLastPayload: body as object },
        }).catch(() => undefined);
      }
    } else {
      processingError = "HMAC inválido — sync Bitrix não executado";
      await prisma.document.update({
        where: { uuidDoc },
        data: { rawLastPayload: body as object },
      }).catch(() => undefined);
    }
  }

  if (processingError) {
    await prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { processingError },
    });
  }

  return c.json({ received: true, bitrixUpdated, verified });
}
