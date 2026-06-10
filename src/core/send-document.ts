import { prisma } from "@/lib/db";
import type { ICrmAdapter } from "@/lib/integrations/crm/types";
import type { ISignatureAdapter } from "@/lib/integrations/signature/types";
import { formatDocumentSentComment } from "@/core/document-comments";

export type SendDocumentStep = "signers" | "build" | "send";

export class SendDocumentError extends Error {
  constructor(
    readonly step: SendDocumentStep,
    message: string,
    readonly httpStatus: 400 | 502 = 502,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SendDocumentError";
  }
}

export interface TemplateMappingInput {
  templateId: string;
  templateName: string;
  documentName: string | null;
  /** JSON array de specs: e-mail, {=Contact:all} ou {=Document:CAMPO}. */
  signersEmails: unknown;
  /** { variavel_template: CAMPO_CRM } */
  mappings: Record<string, string>;
}

export interface SendDocumentInput {
  appId: string;
  entityType: string;
  entityId: string;
  mapping: TemplateMappingInput;
  safeUuid: string;
  webhookUrl: string;
  crm: ICrmAdapter;
  signature: ISignatureAdapter;
  /**
   * Resolução de signatários é específica da plataforma (macros como
   * {=Contact:all} exigem chamadas CRM próprias). O caller fornece a closure.
   */
  resolveSigners: (
    specs: string[],
    crmData: Record<string, unknown>,
  ) => Promise<string[]>;
  /** Identificador do ator nos audit logs (ex.: "bizproc", "hubspot-workflow"). */
  auditActor?: string;
}

export interface SendDocumentResult {
  uuidDoc: string;
  documentName: string;
  signerEmails: string[];
}

/** Substitui tokens {=Document:CAMPO} no nome do documento por valores CRM. */
function resolveDocumentName(
  name: string,
  crmData: Record<string, unknown>,
  entityId: string,
): string {
  return name.replace(/\{=Document:([^}]+)\}/gi, (_, field: string) => {
    const key = field.trim();
    if (key.toUpperCase() === "ID") return entityId;
    const val = crmData[key];
    return val != null ? String(val) : "";
  });
}

/** Aplica o mapeamento variável → campo CRM sobre os dados da entidade. */
function resolveTemplateVariables(
  mappings: Record<string, string>,
  crmData: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [templateVar, crmField] of Object.entries(mappings)) {
    const value = crmData[crmField];
    result[templateVar] = value != null ? String(value) : "";
  }
  return result;
}

function parseSignerSpecs(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as string[]).filter(Boolean);
  if (typeof raw === "string") {
    return raw.split(",").map((e) => e.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Pipeline universal de envio de documento para assinatura.
 *
 * Plataforma-agnóstico: dados CRM via ICrmAdapter, envio via ISignatureAdapter.
 * Persiste Document + AuditLog e comenta na entidade CRM ao final.
 */
export async function sendDocumentFromTemplate(
  input: SendDocumentInput,
): Promise<SendDocumentResult> {
  const { appId, entityType, entityId, mapping, crm, signature } = input;
  const auditActor = input.auditActor ?? "send-document";

  const crmData = await crm.getEntity(entityType, entityId);

  const rawDocumentName =
    mapping.documentName ?? `Documento ${entityType} ${entityId}`;
  const documentName = resolveDocumentName(rawDocumentName, crmData, entityId);

  const templateVariables = resolveTemplateVariables(mapping.mappings, crmData);

  // Resolver signatários ANTES de criar o documento — evita órfãos na D4Sign
  const signerSpecs = parseSignerSpecs(mapping.signersEmails);
  let signerEmails: string[];
  try {
    signerEmails = await input.resolveSigners(signerSpecs, crmData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new SendDocumentError("signers", msg, 400);
  }

  if (signerEmails.length === 0) {
    throw new SendDocumentError(
      "signers",
      "Nenhum signatário válido. Configure signatários em Operação → Templates.",
      400,
      { specs: signerSpecs },
    );
  }

  console.log("[send-document] signatários resolvidos:", {
    specs: signerSpecs,
    emails: signerEmails,
  });

  let uuidDoc: string;
  try {
    const result = await signature.sendDocument({
      safeUuid: input.safeUuid,
      documentName,
      templateId: mapping.templateId,
      templateVariables,
      signers: signerEmails.map((email) => ({ email })),
      webhookUrl: input.webhookUrl,
    });
    uuidDoc = result.uuidDoc;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-document] erro no envio:", msg);
    await prisma.auditLog.create({
      data: {
        appId,
        actor: auditActor,
        action: "d4sign_build_error",
        meta: { error: msg, entity: entityType, entity_id: entityId },
      },
    });
    throw new SendDocumentError("build", `Erro ao criar documento: ${msg}`, 502);
  }

  await prisma.document.upsert({
    where: { uuidDoc },
    create: {
      appId,
      uuidDoc,
      entityType,
      entityId,
      statusName: "Aguardando Assinaturas",
      statusId: 3,
      signerTotal: signerEmails.length,
      signedSignerEmails: [],
    },
    update: {
      statusName: "Aguardando Assinaturas",
      statusId: 3,
      signerTotal: signerEmails.length,
      signedSignerEmails: [],
    },
  });

  await prisma.auditLog.create({
    data: {
      appId,
      actor: auditActor,
      action: "enviar_documento_d4sign",
      meta: {
        uuidDoc,
        entity: entityType,
        entity_id: entityId,
        templateId: mapping.templateId,
      },
    },
  });

  try {
    await crm.addNote(
      entityType,
      entityId,
      formatDocumentSentComment({
        documentName,
        uuidDoc,
        templateName: mapping.templateName,
        signers: signerEmails,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-document] falha ao adicionar nota CRM:", msg);
  }

  return { uuidDoc, documentName, signerEmails };
}
