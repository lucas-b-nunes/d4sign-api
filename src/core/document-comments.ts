/** Textos de notas/comentários CRM sobre documentos D4Sign (plataforma-neutro). */

export function formatDocumentSentComment(input: {
  documentName: string;
  uuidDoc: string;
  templateName?: string;
  signers?: string[];
}): string {
  const lines = [
    "[D4Sign] Documento enviado para assinatura",
    `Documento: ${input.documentName}`,
    `UUID: ${input.uuidDoc}`,
  ];
  if (input.templateName) lines.push(`Template: ${input.templateName}`);
  if (input.signers?.length) lines.push(`Signatários: ${input.signers.join(", ")}`);
  lines.push("Status: Aguardando Assinaturas");
  return lines.join("\n");
}

export function formatDocumentStatusComment(input: {
  uuidDoc: string;
  statusName: string;
  previousStatus?: string | null;
  email?: string;
  message?: string;
}): string {
  const lines = ["[D4Sign] Movimentação do documento", `UUID: ${input.uuidDoc}`];

  if (input.previousStatus && input.previousStatus !== input.statusName) {
    lines.push(`Status anterior: ${input.previousStatus}`);
  }

  lines.push(`Status: ${input.statusName}`);

  if (input.email?.trim()) lines.push(`E-mail: ${input.email.trim()}`);
  if (input.message?.trim() && input.message.trim() !== input.statusName) {
    lines.push(`Detalhe: ${input.message.trim()}`);
  }

  return lines.join("\n");
}
