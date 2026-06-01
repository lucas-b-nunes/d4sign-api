import "dotenv/config";
import { serve } from "@hono/node-server";
import { runTokenRefreshJob } from "@/jobs/token-refresh";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleInstall } from "@/routes/install";
import {
  handleCancelarDocumento,
  handleEnviarDocumento,
  handleSaveSettings,
} from "@/routes/bitrix-robots";
import {
  handleGetD4SignSettings,
  handlePutD4SignSettings,
  handleTestD4SignSettings,
} from "@/routes/settings";
import { handleD4SignWebhook } from "@/routes/webhooks";
import {
  handleGetTenant,
  handleGetTenantDocuments,
  handleResolveTenant,
} from "@/routes/tenants";
import {
  handleListSafes,
  handleSetDefaultSafe,
  handleListTemplates,
  handleGetTemplateMappings,
  handleUpsertTemplateMapping,
} from "@/routes/d4sign-catalog";
import { handleGetDealFields } from "@/routes/bitrix-crm";

const app = new Hono();

const corsOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
];

app.use(
  "*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", async (c, next) => {
  await next();
  c.header("ngrok-skip-browser-warning", "true");
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/bitrix/install", handleInstall);
app.post("/bitrix/install", handleInstall);
app.get("/api/bitrix/install", handleInstall);
app.post("/api/bitrix/install", handleInstall);

app.post("/bitrix/enviar-documento", handleEnviarDocumento);
app.post("/bitrix/cancelar-documento", handleCancelarDocumento);
app.post("/bitrix/save-settings/:id", handleSaveSettings);

app.get("/api/settings/d4sign", handleGetD4SignSettings);
app.put("/api/settings/d4sign", handlePutD4SignSettings);
app.post("/api/settings/d4sign/test", handleTestD4SignSettings);

app.post("/api/webhooks/d4sign", handleD4SignWebhook);

app.get("/api/tenants/by-domain", handleResolveTenant);
app.get("/api/tenants/:memberId", handleGetTenant);
app.get("/api/tenants/:memberId/documents", handleGetTenantDocuments);

app.get("/api/d4sign/safes", handleListSafes);
app.put("/api/d4sign/safes/default", handleSetDefaultSafe);
app.get("/api/d4sign/templates", handleListTemplates);
app.get("/api/d4sign/template-mappings", handleGetTemplateMappings);
app.put("/api/d4sign/template-mappings/:templateId", handleUpsertTemplateMapping);

app.get("/api/bitrix/deal-fields", handleGetDealFields);

const port = Number(process.env.PORT ?? 3001);
console.log(`d4sign-api listening on http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port });

// Token refresh job: executa imediatamente e depois a cada 5 min
runTokenRefreshJob().catch(console.error);
setInterval(() => { runTokenRefreshJob().catch(console.error); }, 5 * 60 * 1000);
