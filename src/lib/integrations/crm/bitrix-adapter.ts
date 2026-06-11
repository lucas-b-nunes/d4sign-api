import { bitrixRestGet } from "@/lib/bitrix/bitrix24";
import { bitrixUpdateCrmEntity } from "@/lib/bitrix/crm-update";
import { bitrixAddTimelineComment } from "@/lib/bitrix/timeline-comment";
import { CRM_PLATFORM } from "@/lib/platform";
import type { CrmPropertyDef, ICrmAdapter } from "./types";

function entityGetMethod(type: string): string {
  return type === "lead" ? "crm.lead.get" : "crm.deal.get";
}

function entityFieldsMethod(type: string): string {
  switch (type) {
    case "lead":
      return "crm.lead.fields";
    case "contact":
      return "crm.contact.fields";
    case "company":
      return "crm.company.fields";
    default:
      return "crm.deal.fields";
  }
}

export function createBitrixCrmAdapter(
  domain: string,
  accessToken: string,
): ICrmAdapter {
  return {
    platform: CRM_PLATFORM.BITRIX24,

    async getEntity(type, id) {
      const res = (await bitrixRestGet(domain, accessToken, entityGetMethod(type), {
        id,
      })) as { result?: Record<string, unknown> };
      return res.result ?? {};
    },

    async listEntityProperties(type) {
      const res = (await bitrixRestGet(
        domain,
        accessToken,
        entityFieldsMethod(type),
      )) as { result?: Record<string, { title?: string; type?: string }> };

      const fields: CrmPropertyDef[] = Object.entries(res?.result ?? {})
        .map(([fieldId, meta]) => ({
          fieldId,
          label: meta?.title ?? fieldId,
          type: meta?.type ?? "string",
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

      return fields;
    },

    async updateEntity(type, id, fields) {
      await bitrixUpdateCrmEntity(domain, accessToken, type, id, fields);
    },

    async addNote(type, id, text, attachments) {
      await bitrixAddTimelineComment(domain, accessToken, {
        entityType: type,
        entityId: id,
        comment: text,
        files: attachments?.map(
          (a) => [a.fileName, a.base64] as [string, string],
        ),
      });
    },

    encodeFileFieldValue(fileName, base64) {
      return { fileData: [fileName, base64] };
    },
  };
}
