import { bitrixRestPostForm } from "@/lib/bitrix/bitrix24";
import { bitrixApiError } from "@/lib/bitrix/crm-update";

export type TimelineEntityType = "deal" | "lead";

export function normalizeTimelineEntityType(
  entityType: string,
): TimelineEntityType | null {
  const normalized = entityType.trim().toLowerCase();
  if (normalized === "deal" || normalized === "lead") return normalized;
  return null;
}

export type TimelineCommentFile = [fileName: string, base64Content: string];

/**
 * Adiciona comentário na timeline do CRM via crm.timeline.comment.add.
 * @see https://apidocs.bitrix24.com/api-reference/crm/timeline/comments/crm-timeline-comment-add.html
 */
export async function bitrixAddTimelineComment(
  domain: string,
  accessToken: string,
  params: {
    entityType: string;
    entityId: string;
    comment: string;
    files?: TimelineCommentFile[];
  },
): Promise<number | null> {
  const entityType = normalizeTimelineEntityType(params.entityType);
  if (!entityType) {
    console.warn("[bitrix-timeline] entityType não suportado:", params.entityType);
    return null;
  }

  const entityId = Number.parseInt(params.entityId, 10);
  if (!Number.isFinite(entityId) || entityId <= 0) {
    console.warn("[bitrix-timeline] entityId inválido:", params.entityId);
    return null;
  }

  const comment = params.comment.trim();
  if (!comment) {
    console.warn("[bitrix-timeline] comentário vazio — ignorado");
    return null;
  }

  const fields: Record<string, unknown> = {
    ENTITY_ID: entityId,
    ENTITY_TYPE: entityType,
    COMMENT: comment,
  };

  if (params.files?.length) {
    fields.FILES = params.files;
  }

  console.log("[bitrix-timeline] crm.timeline.comment.add:", {
    entityType,
    entityId,
    hasFiles: Boolean(params.files?.length),
    preview: comment.slice(0, 120),
  });

  const res = await bitrixRestPostForm(
    domain,
    accessToken,
    "crm.timeline.comment.add",
    { fields },
  );

  const err = bitrixApiError(res);
  if (err) {
    console.error("[bitrix-timeline] erro:", err, JSON.stringify(res).slice(0, 500));
    throw new Error(err);
  }

  const commentId =
    res && typeof res === "object" && "result" in res
      ? (res as { result?: number }).result ?? null
      : null;

  console.log("[bitrix-timeline] comentário adicionado:", { commentId });
  return commentId;
}

export {
  formatDocumentSentComment,
  formatDocumentStatusComment,
} from "@/core/document-comments";
