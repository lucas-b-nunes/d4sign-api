import { bitrixRestGet } from "@/lib/bitrix/bitrix24";

type DealContactItem = {
  CONTACT_ID: number | string;
  SORT?: number | string;
  IS_PRIMARY?: string;
};

type BitrixContact = {
  EMAIL?: Array<{ VALUE?: string; VALUE_TYPE?: string }>;
};

export function extractContactEmail(contact: BitrixContact): string | null {
  const emails = contact.EMAIL ?? [];
  const work = emails.find((e) => e.VALUE_TYPE === "WORK" && e.VALUE?.trim());
  if (work?.VALUE) return work.VALUE.trim();
  const first = emails.find((e) => e.VALUE?.trim());
  return first?.VALUE?.trim() ?? null;
}

export async function fetchDealContactItems(
  domain: string,
  accessToken: string,
  dealId: string,
): Promise<DealContactItem[]> {
  const result = (await bitrixRestGet(
    domain,
    accessToken,
    "crm.deal.contact.items.get",
    { id: dealId },
  )) as { result?: DealContactItem[] };

  return Array.isArray(result?.result) ? result.result : [];
}

export async function fetchContactById(
  domain: string,
  accessToken: string,
  contactId: string,
): Promise<BitrixContact> {
  const result = (await bitrixRestGet(domain, accessToken, "crm.contact.get", {
    id: contactId,
  })) as { result?: BitrixContact };

  return result?.result ?? {};
}

export async function fetchAllDealContactEmails(
  domain: string,
  accessToken: string,
  dealId: string,
): Promise<string[]> {
  const items = await fetchDealContactItems(domain, accessToken, dealId);
  const sorted = [...items].sort(
    (a, b) => Number(a.SORT ?? 0) - Number(b.SORT ?? 0),
  );

  const emails: string[] = [];
  const seen = new Set<string>();

  for (const item of sorted) {
    const contactId = String(item.CONTACT_ID ?? "").trim();
    if (!contactId) continue;

    const contact = await fetchContactById(domain, accessToken, contactId);
    const email = extractContactEmail(contact);
    if (!email) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }

  return emails;
}
