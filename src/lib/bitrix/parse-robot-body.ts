import qs from "qs";

/** Parseia body enviado pelo Bitrix (form-urlencoded ou JSON). */
export function parseBitrixRobotBody(
  raw: string,
  contentType: string,
): Record<string, unknown> {
  const trimmed = raw.trim();
  if (contentType.includes("application/json") || trimmed.startsWith("{")) {
    return normalizeRobotBody(JSON.parse(trimmed) as Record<string, unknown>);
  }

  const parsed = qs.parse(trimmed, {
    allowDots: false,
    depth: 10,
    parseArrays: true,
    arrayLimit: 20,
  }) as Record<string, unknown>;

  return normalizeRobotBody(parsed);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeRobotBody(body: Record<string, unknown>): Record<string, unknown> {
  const data = parseMaybeJson(body.data);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ...body,
      auth: normalizeAuth(body.auth),
      properties: parseMaybeJson(body.properties),
    };
  }

  const d = data as Record<string, unknown>;
  return {
    ...body,
    ...d,
    auth: normalizeAuth(d.auth ?? body.auth),
    properties: parseMaybeJson(d.PROPERTIES ?? d.properties ?? body.properties),
    document_id: d.DOCUMENT_ID ?? d.document_id ?? body.document_id,
    event_token: d.EVENT_TOKEN ?? d.event_token ?? body.event_token,
    use_subscription: d.USE_SUBSCRIPTION ?? d.use_subscription ?? body.use_subscription,
  };
}

function normalizeAuth(value: unknown): Record<string, unknown> | undefined {
  const auth = parseMaybeJson(value);
  if (auth && typeof auth === "object" && !Array.isArray(auth)) {
    return auth as Record<string, unknown>;
  }
  return undefined;
}

export { buildD4SignTemplatePayload } from "@/lib/d4sign/template-payload";

export function extractAuth(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return normalizeAuth(body.auth);
}

export function extractMemberId(body: Record<string, unknown>): string | undefined {
  const auth = extractAuth(body);
  const fromAuth = auth?.member_id ?? auth?.memberId ?? auth?.MEMBER_ID;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();
  if (typeof fromAuth === "number") return String(fromAuth);

  const top = body.member_id ?? body.memberId ?? body.MEMBER_ID;
  if (typeof top === "string" && top.trim()) return top.trim();
  if (typeof top === "number") return String(top);

  return undefined;
}

export function extractAuthDomain(body: Record<string, unknown>): string | undefined {
  const auth = extractAuth(body);
  const domain = auth?.domain ?? auth?.DOMAIN ?? body.domain ?? body.DOMAIN;
  if (typeof domain === "string" && domain.trim()) {
    return domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return undefined;
}

export function extractDocumentEntity(body: Record<string, unknown>): {
  entity: string;
  entityId: string;
} {
  const docId = body.document_id;
  if (Array.isArray(docId) && docId[2] != null) {
    const parts = String(docId[2]).split("_");
    return {
      entity: (parts[0] ?? "deal").toLowerCase(),
      entityId: parts[1] ?? "0",
    };
  }
  return { entity: "deal", entityId: "0" };
}

export function normalizeBitrixProperty(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeBitrixProperty(item);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      normalizeBitrixProperty(obj.value) ??
      normalizeBitrixProperty(obj.VALUE) ??
      normalizeBitrixProperty(obj.id) ??
      normalizeBitrixProperty(obj.ID)
    );
  }
  return undefined;
}

export function extractTemplateId(body: Record<string, unknown>): string | undefined {
  const properties = body.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    const fromProps = normalizeBitrixProperty(
      (properties as Record<string, unknown>).template_id,
    );
    if (fromProps) return fromProps;
  }
  return normalizeBitrixProperty(body.template_id);
}
