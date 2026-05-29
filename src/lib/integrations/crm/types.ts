export type CrmEntityType = "deal" | "lead" | "contact" | "company";

export interface ICrmAdapter {
  readonly platform: string;
  getDeal(id: string): Promise<Record<string, unknown>>;
  listContactFields(): Promise<unknown[]>;
}
