import { bitrixRestPostForm } from "@/lib/bitrix/bitrix24";
import type { Instance } from "@/generated/prisma/client";

/** Paridade com `PrismaticIntegrationRepository` */
export async function prismaticEnviarDocumento(
  urlKey: "urlEnviarDocumento" | "urlEnviarDocumentoEnvelope",
  instance: Instance,
  data: Record<string, unknown>,
): Promise<void> {
  const target = instance[urlKey];
  if (!target?.trim()) {
    throw new Error(`Instance.${urlKey} não configurada (URL Prismatic vazia)`);
  }
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Prismatic enviar: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
}

export async function prismaticCancelarDocumento(
  instance: Instance,
  data: Record<string, unknown>,
): Promise<void> {
  const target = instance.urlCancelarDocumento;
  if (!target?.trim()) {
    throw new Error("Instance.urlCancelarDocumento não configurada");
  }
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Prismatic cancelar: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
}

export async function prismaticUpdateSubscriptionGroups(
  instance: Instance,
  memberId: string,
  settingsPayload: Record<string, unknown>,
): Promise<void> {
  const target = instance.urlUpdateSubscriptionGroups;
  if (!target?.trim()) return;

  await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: memberId, ...settingsPayload }),
    cache: "no-store",
  });
}

export async function bitrixEventBind(
  domain: string,
  auth: string,
  event: string,
  handler: string,
): Promise<void> {
  await bitrixRestPostForm(domain, auth, "event.bind", {
    EVENT: event,
    HANDLER: handler,
  });
}

export async function bitrixEventUnbind(
  domain: string,
  auth: string,
  event: string,
  handler: string,
): Promise<void> {
  try {
    await bitrixRestPostForm(domain, auth, "event.unbind", {
      EVENT: event,
      HANDLER: handler,
    });
  } catch {
    /* evento não existia */
  }
}

export async function bitrixBizprocSendEvent(
  domain: string,
  auth: string,
  eventToken: string,
): Promise<void> {
  await bitrixRestPostForm(domain, auth, "bizproc.event.send", {
    EVENT_TOKEN: eventToken,
  });
}
