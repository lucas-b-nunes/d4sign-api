import { createHmac, timingSafeEqual } from "node:crypto";

/** Valida header Content-Hmac: sha256=<hex> conforme doc D4Sign */
export function verifyD4SignWebhookHmac(
  documentUuid: string,
  secret: string,
  contentHmacHeader: string | null,
): boolean {
  if (!contentHmacHeader || !secret) return false;
  const match = /^sha256=(.+)$/i.exec(contentHmacHeader.trim());
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(documentUuid).digest("hex");
  const received = match[1];
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}
