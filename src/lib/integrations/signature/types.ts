export interface ISignatureAdapter {
  readonly provider: "d4sign";
  ping(): Promise<{ ok: boolean }>;
  listSafes(): Promise<unknown>;
  sendDocument(params: {
    entityType: string;
    entityId: string;
    properties: unknown;
  }): Promise<{ uuidDoc: string }>;
}
