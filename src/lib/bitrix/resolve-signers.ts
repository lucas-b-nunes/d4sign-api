import { fetchAllDealContactEmails } from "@/lib/bitrix/crm-contacts";
import {
  SIGNER_CONTACT_ALL,
  extractEmailFromCrmValue,
  isContactAllToken,
  isValidSignerSpec,
  parseDocumentFieldToken,
} from "@/lib/signer-spec";

export {
  SIGNER_CONTACT_ALL,
  extractEmailFromCrmValue,
  isContactAllToken,
  isValidSignerSpec,
  parseDocumentFieldToken,
};

export async function resolveSignerEmails(params: {
  domain: string;
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
      if (params.entityType !== "deal") {
        throw new Error(
          "Signatário 'Contatos vinculados' só está disponível para negócios (Deal).",
        );
      }
      const contactEmails = await fetchAllDealContactEmails(
        params.domain,
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
