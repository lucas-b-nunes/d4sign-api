export interface SignatureSigner {
  email: string;
}

export interface SendSignatureDocumentParams {
  safeUuid: string;
  documentName: string;
  templateId: string;
  /** Variáveis do template já resolvidas (valores CRM aplicados). */
  templateVariables: Record<string, string>;
  signers: SignatureSigner[];
  /** URL pública para receber callbacks de status do documento. */
  webhookUrl?: string;
}

export interface ISignatureAdapter {
  readonly provider: "d4sign";
  ping(): Promise<{ ok: boolean }>;
  listSafes(): Promise<unknown>;

  /**
   * Pipeline completo de envio: cria documento a partir do template,
   * configura webhook, adiciona signatários e envia para assinatura.
   */
  sendDocument(params: SendSignatureDocumentParams): Promise<{ uuidDoc: string }>;

  /** Baixa o PDF (assinado ou em andamento) do documento. */
  downloadDocument(uuidDoc: string): Promise<{ fileName: string; base64: string }>;
}
