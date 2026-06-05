import qs from "qs";

/** Normaliza body do webhook D4Sign (form-data, urlencoded ou JSON). */
export function normalizeD4SignWebhookBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value instanceof File) {
      out[key] = value.name;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          out[key] = JSON.parse(trimmed) as unknown;
          continue;
        } catch {
          // mantém string
        }
      }
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function parseD4SignWebhookText(
  text: string,
  contentType: string,
): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};

  if (contentType.includes("application/json") || trimmed.startsWith("{")) {
    return normalizeD4SignWebhookBody(
      JSON.parse(trimmed) as Record<string, unknown>,
    );
  }

  const parsed = qs.parse(trimmed, {
    allowDots: false,
    depth: 5,
    parseArrays: true,
  }) as Record<string, unknown>;

  return normalizeD4SignWebhookBody(parsed);
}

export function extractWebhookUuid(body: Record<string, unknown>): string | undefined {
  const candidates = [body.uuid, body.uuidDoc, body.UUID, body.uuid_document];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

export function extractTypePost(body: Record<string, unknown>): string | undefined {
  const raw = body.type_post ?? body.typePost ?? body.type;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}
