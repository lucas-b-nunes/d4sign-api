/**
 * @deprecated Legacy Public Apps apenas — contas novas devem usar hubspot-app/
 * (Developer Platform) com workflow-actions/enviar-documento-hsmeta.json + hs project upload.
 *
 * Registra (ou atualiza) o Workflow Custom Action via API v4 + Developer API key.
 *
 * Uso (somente legacy):
 *   node scripts/register-hubspot-action.mjs
 */
import "dotenv/config";

const APP_ID = process.env.HUBSPOT_APP_ID;
const DEV_KEY = process.env.HUBSPOT_DEVELOPER_API_KEY;
const PUBLIC_URL = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");

if (!APP_ID || !DEV_KEY || !PUBLIC_URL) {
  console.error(
    "Defina HUBSPOT_APP_ID, HUBSPOT_DEVELOPER_API_KEY e PUBLIC_APP_URL no .env",
  );
  process.exit(1);
}

const BASE = `https://api.hubapi.com/automation/v4/actions/${APP_ID}`;

const actionDefinition = {
  actionUrl: `${PUBLIC_URL}/hubspot/enviar-documento`,
  objectTypes: ["DEAL"],
  published: true,
  inputFields: [
    {
      typeDefinition: {
        name: "templateId",
        type: "enumeration",
        fieldType: "select",
        optionsUrl: `${PUBLIC_URL}/hubspot/template-options`,
      },
      supportedValueTypes: ["STATIC_VALUE"],
      isRequired: true,
    },
  ],
  outputFields: [
    {
      typeDefinition: { name: "uuidDoc", type: "string", fieldType: "text" },
    },
    {
      typeDefinition: { name: "documentName", type: "string", fieldType: "text" },
    },
    {
      typeDefinition: { name: "signers", type: "string", fieldType: "text" },
    },
  ],
  labels: {
    en: {
      actionName: "Send D4Sign document",
      actionDescription:
        "Creates a document from a D4Sign template, adds signers and sends it for signature.",
      actionCardContent: "Send D4Sign document: {{templateId}}",
      inputFieldLabels: { templateId: "Template" },
      outputFieldLabels: {
        uuidDoc: "D4Sign document UUID",
        documentName: "Document name",
        signers: "Signers",
      },
    },
  },
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}?hapikey=${encodeURIComponent(DEV_KEY)}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path}: HTTP ${res.status} — ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

const existing = await api("GET", "");
const found = (existing?.results ?? []).find(
  (a) => a.actionUrl === actionDefinition.actionUrl,
);

if (found) {
  await api("PATCH", `/${found.id}`, actionDefinition);
  console.log(`Custom action atualizada (id=${found.id})`);
} else {
  const created = await api("POST", "", actionDefinition);
  console.log(`Custom action criada (id=${created.id})`);
}
console.log(`actionUrl:  ${actionDefinition.actionUrl}`);
console.log(`optionsUrl: ${PUBLIC_URL}/hubspot/template-options`);
