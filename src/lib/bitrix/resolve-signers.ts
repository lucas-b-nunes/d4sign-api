import { fetchAllDealContactEmails } from "@/lib/bitrix/crm-contacts";

export const SIGNER_CONTACT_ALL = "{=Contact:all}";

const CONTACT_ALL_RE = /^\{=Contact:all\}$/i;
const DOCUMENT_FIELD_RE = /^\{=Document:([^}]+)\}$/i;

export function isContactAllToken(spec: string): boolean {
  return CONTACT_ALL_RE.test(spec.trim());
}

export function parseDocumentFieldToken(spec: string): string | null {
  const match = DOCUMENT_FIELD_RE.exec(spec.trim());
  return match ? match[1].trim() : null;
}

export function isValidSignerSpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed) return false;
  if (isContactAllToken(trimmed)) return true;
  if (parseDocumentFieldToken(trimmed)) return true;
  return trimmed.includes("@");
}

export function extractEmailFromCrmValue(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.includes("@") ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && "VALUE" in item) {
        const v = String((item as { VALUE: unknown }).VALUE ?? "").trim();
        if (v.includes("@")) return v;
      }
      const nested = extractEmailFromCrmValue(item);
      if (nested) return nested;
    }
  }

  return null;
}

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
