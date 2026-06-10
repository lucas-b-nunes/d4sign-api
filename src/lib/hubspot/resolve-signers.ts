import { hubspotGet, hubspotPost } from "@/lib/hubspot/client";
import { hubspotObjectType } from "@/lib/integrations/crm/hubspot-adapter";
import {
  extractEmailFromCrmValue,
  isContactAllToken,
  parseDocumentFieldToken,
} from "@/lib/signer-spec";

/** E-mails de todos os contatos associados a um deal HubSpot. */
async function fetchDealContactEmails(
  accessToken: string,
  dealId: string,
): Promise<string[]> {
  const assoc = await hubspotGet<{
    results?: { toObjectId: number }[];
  }>(accessToken, `/crm/v4/objects/deals/${dealId}/associations/contacts`);

  const contactIds = (assoc.results ?? []).map((r) => String(r.toObjectId));
  if (contactIds.length === 0) return [];

  const res = await hubspotPost<{
    results?: { properties?: { email?: string } }[];
  }>(accessToken, `/crm/v3/objects/contacts/batch/read`, {
    properties: ["email"],
    inputs: contactIds.map((id) => ({ id })),
  });

  return (res.results ?? [])
    .map((r) => r.properties?.email?.trim() ?? "")
    .filter((e) => e.includes("@"));
}

/**
 * Resolve specs de signatário para e-mails usando dados do HubSpot.
 * Mesmas regras do Bitrix: e-mail literal, {=Contact:all}, {=Document:CAMPO}.
 */
export async function resolveHubspotSignerEmails(params: {
  accessToken: string;
  entityType: string;
  entityId: string;
  specs: string[];
  crmData: Record<string, unknown>;
}): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();

  function addEmail(email: string) {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    resolved.push(trimmed);
  }

  for (const raw of params.specs) {
    const spec = raw.trim();
    if (!spec) continue;

    if (isContactAllToken(spec)) {
      if (hubspotObjectType(params.entityType) !== "deals") {
        throw new Error(
          "Signatário 'Contatos vinculados' só está disponível para negócios (Deal).",
        );
      }
      const contactEmails = await fetchDealContactEmails(
        params.accessToken,
        params.entityId,
      );
      for (const email of contactEmails) addEmail(email);
      continue;
    }

    const fieldKey = parseDocumentFieldToken(spec);
    if (fieldKey) {
      const email = extractEmailFromCrmValue(params.crmData[fieldKey]);
      if (email) addEmail(email);
      continue;
    }

    if (spec.includes("@")) {
      addEmail(spec);
    }
  }

  return resolved;
}
