/**
 * Smoke test rápido da API (sem credenciais externas).
 *
 * Uso:
 *   node scripts/smoke-health.mjs
 *   API_URL=https://seu-ngrok.ngrok-free.app PORTAL_ID=12345678 node scripts/smoke-health.mjs
 */
const API_URL = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const PORTAL_ID = process.env.PORTAL_ID?.trim();

async function get(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

console.log(`API: ${API_URL}`);

const health = await get("/health");
console.log(health.status === 200 ? "✓ /health" : "✗ /health", health.body);

if (PORTAL_ID) {
  const tenant = await get(`/api/tenants/${encodeURIComponent(PORTAL_ID)}`);
  if (tenant.status === 200) {
    console.log(`✓ tenant ${PORTAL_ID}`, {
      platform: tenant.body.platform,
      d4signConfigured: tenant.body.d4signConfigured,
      status: tenant.body.status,
    });
  } else {
    console.log(`✗ tenant ${PORTAL_ID} (HTTP ${tenant.status})`, tenant.body);
  }

  const props = await get(
    `/api/hubspot/deal-properties?portalId=${encodeURIComponent(PORTAL_ID)}`,
  );
  if (props.status === 200) {
    const count = props.body?.fields?.length ?? 0;
    console.log(`✓ deal-properties (${count} propriedades)`);
  } else {
    console.log(`✗ deal-properties (HTTP ${props.status})`, props.body);
  }
} else {
  console.log("(dica) defina PORTAL_ID para validar tenant e deal-properties");
}
