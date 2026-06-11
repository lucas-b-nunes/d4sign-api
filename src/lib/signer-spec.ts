/**
 * Especificações de signatário usadas nos mapeamentos de template.
 * Plataforma-neutro: e-mail literal, {=Contact:all} ou {=Document:CAMPO}.
 * Cada plataforma resolve os tokens para e-mails reais do seu CRM.
 */

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
