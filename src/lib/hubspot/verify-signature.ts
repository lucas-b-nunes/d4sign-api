import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerância máxima do timestamp da requisição (5 minutos). */
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/**
 * Valida o header X-HubSpot-Signature-v3.
 *
 * Assinatura = base64(HMAC-SHA256(clientSecret, method + uri + body + timestamp))
 * @see https://developers.hubspot.com/docs/api/webhooks/validating-requests
 */
export function verifyHubspotSignatureV3(input: {
  clientSecret: string;
  method: string;
  /** URL completa da requisição como recebida pelo HubSpot (com query string). */
  url: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): boolean {
  if (!input.signature || !input.timestamp) return false;

  const ts = Number.parseInt(input.timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_TIMESTAMP_SKEW_MS) return false;

  const payload = `${input.method.toUpperCase()}${input.url}${input.rawBody}${input.timestamp}`;
  const expected = createHmac("sha256", input.clientSecret)
    .update(payload, "utf8")
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
