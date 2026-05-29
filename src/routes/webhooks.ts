import type { Context } from "hono";
import { prisma } from "@/lib/db";
import { verifyD4SignWebhookHmac } from "@/lib/d4sign/webhook-hmac";

export async function handleD4SignWebhook(c: Context) {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const uuidDoc =
    typeof body.uuid === "string"
      ? body.uuid
      : typeof body.uuidDoc === "string"
        ? body.uuidDoc
        : undefined;

  const contentHmac = c.req.header("content-hmac");
  let verified = false;
  let appId: string | null = null;

  if (uuidDoc) {
    const doc = await prisma.document.findUnique({
      where: { uuidDoc },
      include: { app: { include: { d4signCredential: true } } },
    });
    if (doc) {
      appId = doc.appId;
      const secret = doc.app.d4signCredential?.hmacSecret;
      if (secret) {
        verified = verifyD4SignWebhookHmac(
          uuidDoc,
          secret,
          contentHmac ?? null,
        );
      }
    }
  }

  await prisma.webhookLog.create({
    data: {
      appId,
      bodyJson: body as object,
      verified,
      headersHash: contentHmac?.slice(0, 128) ?? null,
    },
  });

  if (uuidDoc && appId) {
    await prisma.document.updateMany({
      where: { uuidDoc },
      data: {
        rawLastPayload: body as object,
        statusName:
          typeof body.statusName === "string" ? body.statusName : undefined,
        statusId:
          typeof body.statusId === "number"
            ? body.statusId
            : typeof body.statusId === "string"
              ? Number.parseInt(body.statusId, 10)
              : undefined,
      },
    });
  }

  return c.json({ received: true });
}
