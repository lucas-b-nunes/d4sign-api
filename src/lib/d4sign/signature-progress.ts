export function parseSignedSignerEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().toLowerCase());
}

export function addSignedSignerEmail(emails: string[], email: string | undefined): string[] {
  if (!email?.trim()) return emails;
  const normalized = email.trim().toLowerCase();
  if (emails.includes(normalized)) return emails;
  return [...emails, normalized];
}

export function formatPartialSignedStatus(signed: number, total: number): string {
  return `Assinado (${signed}/${total})`;
}

export function parsePartialSignedStatus(
  status: string,
): { signed: number; total: number } | null {
  const match = status.trim().match(/^Assinado\s*\((\d+)\/(\d+)\)$/i);
  if (!match) return null;

  const signed = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (!Number.isFinite(signed) || !Number.isFinite(total) || total < 1) return null;

  return { signed, total };
}

export function isPartialSignatureInProgress(status: string): boolean {
  const parsed = parsePartialSignedStatus(status);
  if (!parsed) return false;
  return parsed.signed < parsed.total;
}
