import type { Context, Next } from "hono";
import { parseBitrixRobotBody } from "@/lib/bitrix/parse-robot-body";

function redactSecrets(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSecrets);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower === "auth_id" ||
      lower === "refresh_id"
    ) {
      out[key] = "[redacted]";
    } else if (typeof val === "object") {
      out[key] = redactSecrets(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function readBodyPreview(c: Context): Promise<unknown> {
  const path = c.req.path;
  const verbose =
    path.startsWith("/bitrix/") ||
    path.startsWith("/api/webhooks/");

  if (!verbose || c.req.method === "GET" || c.req.method === "HEAD") {
    return undefined;
  }

  try {
    const clone = c.req.raw.clone();
    const contentType = clone.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await clone.json()) as unknown;
      return redactSecrets(json);
    }
    const text = await clone.text();
    if (!text.trim()) return undefined;
    if (text.trim().startsWith("{") || contentType.includes("application/json")) {
      try {
        return redactSecrets(JSON.parse(text) as unknown);
      } catch {
        return text.slice(0, 800);
      }
    }
    try {
      return redactSecrets(parseBitrixRobotBody(text, contentType));
    } catch {
      return text.slice(0, 800);
    }
  } catch {
    return undefined;
  }
}

/** Loga toda requisição HTTP no stdout (visível no terminal do pnpm dev). */
export async function requestLogger(c: Context, next: Next) {
  const started = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const query = c.req.url.includes("?")
    ? c.req.url.slice(c.req.url.indexOf("?"))
    : "";

  const bodyPreview = await readBodyPreview(c);

  console.log(`[http] → ${method} ${path}${query}`);
  if (bodyPreview !== undefined) {
    console.log("[http] body:", JSON.stringify(bodyPreview, null, 2));
  }

  await next();

  const ms = Date.now() - started;
  console.log(`[http] ← ${method} ${path} ${c.res.status} ${ms}ms`);
}
