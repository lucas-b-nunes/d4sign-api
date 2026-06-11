/**
 * Identificação universal de plataforma CRM.
 *
 * Cada app CRM integrado (Bitrix24, HubSpot, …) é representado por um valor
 * deste enum. Usado no schema Prisma (fase 1) e em todos os adapters.
 */
export const CRM_PLATFORM = {
  BITRIX24: "bitrix24",
  HUBSPOT: "hubspot",
} as const;

export type CrmPlatform = (typeof CRM_PLATFORM)[keyof typeof CRM_PLATFORM];

/**
 * Identificador universal de tenant.
 *
 * Bitrix24 → platform: "bitrix24", portalId: member_id
 * HubSpot  → platform: "hubspot",  portalId: account ID numérico (string)
 */
export interface TenantIdentifier {
  platform: CrmPlatform;
  portalId: string;
}

/**
 * Constrói um TenantIdentifier para Bitrix24.
 * Alias para manter retrocompatibilidade com o param `memberId` existente.
 */
export function bitrixTenantId(memberId: string): TenantIdentifier {
  return { platform: CRM_PLATFORM.BITRIX24, portalId: memberId };
}

/**
 * Constrói um TenantIdentifier para HubSpot.
 */
export function hubspotTenantId(portalId: string): TenantIdentifier {
  return { platform: CRM_PLATFORM.HUBSPOT, portalId };
}

/**
 * Tipos de entidade CRM reconhecidos pela pipeline universal de envio.
 * Cada plataforma mapeia seus nomes internos para este conjunto.
 */
export const CRM_ENTITY_TYPE = {
  DEAL: "deal",
  LEAD: "lead",
  CONTACT: "contact",
  COMPANY: "company",
} as const;

export type CrmEntityType = (typeof CRM_ENTITY_TYPE)[keyof typeof CRM_ENTITY_TYPE];

/**
 * Definição de propriedade/campo CRM — usada no editor de mapeamento de templates.
 */
export interface CrmPropertyDef {
  fieldId: string;
  label: string;
  type: string;
}
