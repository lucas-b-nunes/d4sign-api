import { bitrixRestGet } from "@/lib/bitrix/bitrix24";
import type { ICrmAdapter } from "./types";

export function createBitrixCrmAdapter(
  domain: string,
  accessToken: string,
): ICrmAdapter {
  return {
    platform: "bitrix24",
    async getDeal(id: string) {
      const res = (await bitrixRestGet(domain, accessToken, "crm.deal.get", {
        ID: id,
      })) as { result?: Record<string, unknown> };
      return res.result ?? {};
    },
    async listContactFields() {
      const res = (await bitrixRestGet(
        domain,
        accessToken,
        "crm.contact.userfield.list",
      )) as { result?: unknown[] };
      return res.result ?? [];
    },
  };
}
