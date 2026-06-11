import type { CrmPlatform, CrmEntityType, CrmPropertyDef } from "@/lib/platform";

export type { CrmEntityType, CrmPropertyDef };

export interface CrmNoteAttachment {
  fileName: string;
  base64: string;
}

export interface ICrmAdapter {
  readonly platform: CrmPlatform;

  /** Busca uma entidade CRM (deal, lead, etc.) pelo ID. */
  getEntity(type: CrmEntityType | string, id: string): Promise<Record<string, unknown>>;

  /** Lista propriedades/campos disponíveis para uma entidade. */
  listEntityProperties(type: CrmEntityType | string): Promise<CrmPropertyDef[]>;

  /** Atualiza campos de uma entidade CRM. */
  updateEntity(
    type: CrmEntityType | string,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<void>;

  /** Adiciona uma nota/comentário a uma entidade, com anexos opcionais. */
  addNote(
    type: CrmEntityType | string,
    id: string,
    text: string,
    attachments?: CrmNoteAttachment[],
  ): Promise<void>;

  /**
   * Codifica um arquivo no formato de valor de campo da plataforma.
   * Bitrix: { fileData: [nome, base64] } (síncrono).
   * HubSpot: faz upload no Files tool e retorna a URL (assíncrono).
   */
  encodeFileFieldValue(fileName: string, base64: string): unknown | Promise<unknown>;
}
