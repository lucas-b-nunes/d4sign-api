import "dotenv/config";
import { serve } from "@hono/node-server";
import { runTokenRefreshJob } from "@/jobs/token-refresh";
import { Hono } from "hono";
import { cors } from "hono/cors";
// Rotas específicas Bitrix24
import { handleInstall } from "@/routes/bitrix/install";
import {
  handleCancelarDocumento,
  handleEnviarDocumento,
  handleSaveSettings,
} from "@/routes/bitrix/robots";
import { handleGetDealFields, handleSyncRobot } from "@/routes/bitrix/crm";
// Rotas específicas HubSpot
import {
  handleHubspotOAuthStart,
  handleHubspotOAuthCallback,
} from "@/routes/hubspot/install";
import {
  handleHubspotEnviarDocumento,
  handleHubspotTemplateOptions,
} from "@/routes/hubspot/workflow";
import { handleGetHubspotDealProperties } from "@/routes/hubspot/crm";
// Rotas compartilhadas (todos os frontends/plataformas)
import {
  handleGetD4SignSettings,
  handlePutD4SignSettings,
  handleTestD4SignSettings,
} from "@/routes/shared/settings";
import { handleD4SignWebhook } from "@/routes/shared/webhooks";
import {
  handleGetTenant,
  handleGetTenantDocuments,
  handleResolveTenant,
} from "@/routes/shared/tenants";
import {
  handleListSafes,
  handleSetDefaultSafe,
  handleListTemplates,
  handleGetTemplateMappings,
  handleUpsertTemplateMapping,
} from "@/routes/shared/d4sign-catalog";
import {
  handleGetGlobalsSettings,
  handlePutGlobalsSettings,
} from "@/routes/shared/globals-settings";
import { requestLogger } from "@/lib/request-logger";

const app = new Hono();

const corsOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
];

app.use("*", requestLogger);

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

// ROTAS BITRIX SUFIXO /BITRIX
app.get("/bitrix/install", handleInstall);
app.post("/bitrix/install", handleInstall);
app.post("/bitrix/enviar-documento", handleEnviarDocumento);
app.post("/bitrix/cancelar-documento", handleCancelarDocumento);
app.post("/bitrix/save-settings/:id", handleSaveSettings);

// ROTAS API BITRIX SUFIXO /API/BITRIX
app.get("/api/bitrix/install", handleInstall);
app.post("/api/bitrix/install", handleInstall);
app.get("/api/bitrix/deal-fields", handleGetDealFields);
app.post("/api/bitrix/sync-robot", handleSyncRobot);

// HubSpot
app.get("/hubspot/oauth", handleHubspotOAuthStart);
app.get("/hubspot/install", handleHubspotOAuthStart);
app.get("/hubspot/oauth/callback", handleHubspotOAuthCallback);
app.post("/hubspot/enviar-documento", handleHubspotEnviarDocumento);
app.post("/hubspot/template-options", handleHubspotTemplateOptions);
app.get("/api/hubspot/deal-properties", handleGetHubspotDealProperties);

// ROTAS API WEBHOOKS SUFIXO /API/WEBHOOKS
app.post("/api/webhooks/d4sign", handleD4SignWebhook);

// ROTAS API TENANTS SUFIXO /API/TENANTS
app.get("/api/tenants/by-domain", handleResolveTenant);
app.get("/api/tenants/:memberId", handleGetTenant);
app.get("/api/tenants/:memberId/documents", handleGetTenantDocuments);

// ROTAS API D4SIGN SUFIXO /API/D4SIGN
app.get("/api/d4sign/safes", handleListSafes);
app.put("/api/d4sign/safes/default", handleSetDefaultSafe);
app.get("/api/d4sign/templates", handleListTemplates);
app.get("/api/d4sign/template-mappings", handleGetTemplateMappings);
app.put("/api/d4sign/template-mappings/:templateId", handleUpsertTemplateMapping);

// ROTAS API SETTINGS SUFIXO /API/SETTINGS
app.get("/api/settings/globals", handleGetGlobalsSettings);
app.put("/api/settings/globals", handlePutGlobalsSettings);
app.get("/api/settings/d4sign", handleGetD4SignSettings);
app.put("/api/settings/d4sign", handlePutD4SignSettings);
app.post("/api/settings/d4sign/test", handleTestD4SignSettings);

const port = Number(process.env.PORT ?? 3001);
console.log(`d4sign-api listening on http://127.0.0.1:${port}`);
console.log(`[boot] PUBLIC_APP_URL=${process.env.PUBLIC_APP_URL ?? "(não definido)"}`);
console.log(`[boot] ngrok deve apontar para: http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port });

// Token refresh job: executa imediatamente e depois a cada 5 min
runTokenRefreshJob().catch(console.error);
setInterval(() => { runTokenRefreshJob().catch(console.error); }, 5 * 60 * 1000);
