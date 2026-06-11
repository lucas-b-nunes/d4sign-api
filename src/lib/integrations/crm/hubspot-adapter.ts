import {
  hubspotGet,
  hubspotPatch,
  hubspotPost,
  hubspotUploadFile,
} from "@/lib/hubspot/client";
import { CRM_PLATFORM } from "@/lib/platform";
import type { CrmPropertyDef, ICrmAdapter } from "./types";

/** entityType interno → object type da API HubSpot v3. */
export function hubspotObjectType(type: string): string {
  switch (type) {
    case "contact":
      return "contacts";
    case "company":
      return "companies";
    case "lead":
    case "deal":
    default:
      return "deals";
  }
}

/** associationTypeId HUBSPOT_DEFINED de nota → objeto. */
function noteAssociationTypeId(objectType: string): number {
  switch (objectType) {
    case "contacts":
      return 202;
    case "companies":
      return 190;
    default:
      return 214; // deals
  }
}

type HubspotPropertyMeta = {
  name: string;
  label: string;
  type: string;
};

async function listPropertyNames(
  accessToken: string,
  objectType: string,
): Promise<HubspotPropertyMeta[]> {
  const res = await hubspotGet<{ results?: HubspotPropertyMeta[] }>(
    accessToken,
    `/crm/v3/properties/${objectType}`,
  );
  return res.results ?? [];
}

export function createHubspotCrmAdapter(accessToken: string): ICrmAdapter {
  return {
    platform: CRM_PLATFORM.HUBSPOT,

    async getEntity(type, id) {
      const objectType = hubspotObjectType(type);
      // Batch read aceita lista de propriedades no body — sem limite de URL
      const properties = (await listPropertyNames(accessToken, objectType)).map(
        (p) => p.name,
      );
      const res = await hubspotPost<{
        results?: { id: string; properties?: Record<string, unknown> }[];
      }>(accessToken, `/crm/v3/objects/${objectType}/batch/read`, {
        properties,
        inputs: [{ id }],
      });
      const row = res.results?.[0];
      return { ...(row?.properties ?? {}), hs_object_id: row?.id ?? id };
    },

    async listEntityProperties(type) {
      const objectType = hubspotObjectType(type);
      const props = await listPropertyNames(accessToken, objectType);

      const fields: CrmPropertyDef[] = props
        .map((p) => ({
          fieldId: p.name,
          label: p.label || p.name,
          type: p.type || "string",
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

      return fields;
    },

    async updateEntity(type, id, fields) {
      const objectType = hubspotObjectType(type);
      const properties: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        properties[key] = value == null ? "" : String(value);
      }
      await hubspotPatch(accessToken, `/crm/v3/objects/${objectType}/${id}`, {
        properties,
      });
    },

    async addNote(type, id, text, attachments) {
      const objectType = hubspotObjectType(type);

      const attachmentIds: string[] = [];
      for (const att of attachments ?? []) {
        const uploaded = await hubspotUploadFile(
          accessToken,
          att.fileName,
          att.base64,
        );
        attachmentIds.push(uploaded.id);
      }

      await hubspotPost(accessToken, `/crm/v3/objects/notes`, {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: text,
          ...(attachmentIds.length > 0
            ? { hs_attachment_ids: attachmentIds.join(";") }
            : {}),
        },
        associations: [
          {
            to: { id },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: noteAssociationTypeId(objectType),
              },
            ],
          },
        ],
      });
    },

    async encodeFileFieldValue(fileName, base64) {
      // HubSpot não tem campo de arquivo nativo em deals — armazena a URL
      // do PDF (Files tool) em uma propriedade de texto/URL.
      const uploaded = await hubspotUploadFile(accessToken, fileName, base64);
      return uploaded.url;
    },
  };
}
