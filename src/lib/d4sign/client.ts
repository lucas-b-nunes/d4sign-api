const DEFAULT_BASE = "https://secure.d4sign.com.br/api/v1";

export type D4SignClientConfig = {
  tokenApi: string;
  cryptKey?: string | null;
  baseUrl?: string;
};

export type D4SignSafe = {
  uuid_safe: string;
  "name-safe": string;
};

export type D4SignTemplateVariable = string[] | Record<string, string[]>;

export type D4SignTemplate = {
  id: string;
  name: string;
  type: "html" | "word" | string;
  variables: D4SignTemplateVariable;
};

export type D4SignSigner = {
  email: string;
  act?: string;
  foreign?: string;
  certificadoicpbr?: string;
  assinatura_presencial?: string;
};

function buildUrl(
  path: string,
  config: D4SignClientConfig,
  extra?: Record<string, string>,
): string {
  const base = (config.baseUrl ?? process.env.D4SIGN_API_BASE_URL ?? DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("tokenAPI", config.tokenApi);
  if (config.cryptKey) url.searchParams.set("cryptKey", config.cryptKey);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function d4signPost<T = unknown>(
  path: string,
  config: D4SignClientConfig,
  body?: unknown,
): Promise<T> {
  const res = await fetch(buildUrl(path, config), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`D4Sign ${path}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function d4signPing(config: D4SignClientConfig): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  try {
    const res = await fetch(buildUrl("/account", config), {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: t.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function d4signListSafes(config: D4SignClientConfig): Promise<D4SignSafe[]> {
  const res = await fetch(buildUrl("/safes", config), { cache: "no-store" });
  if (!res.ok) throw new Error(`D4Sign safes: HTTP ${res.status}`);
  return res.json() as Promise<D4SignSafe[]>;
}

export async function d4signListTemplates(
  config: D4SignClientConfig,
): Promise<Record<string, D4SignTemplate>> {
  return d4signPost<Record<string, D4SignTemplate>>("/templates", config);
}

export async function d4signBuildFromTemplate(
  config: D4SignClientConfig,
  safeUuid: string,
  documentName: string,
  templates: Record<string, Record<string, unknown>>,
  templateType: "html" | "word" | string = "word",
): Promise<{ uuid: string; message?: string }> {
  const path =
    templateType === "html"
      ? `/documents/${safeUuid}/makedocumentbytemplate`
      : `/documents/${safeUuid}/makedocumentbytemplateword`;

  return d4signPost(path, config, {
    name_document: documentName,
    templates,
  });
}

export async function d4signConfigureWebhook(
  config: D4SignClientConfig,
  docUuid: string,
  webhookUrl: string,
): Promise<unknown> {
  return d4signPost(`/documents/${docUuid}/webhooks`, config, { url: webhookUrl });
}

export async function d4signAddSigners(
  config: D4SignClientConfig,
  docUuid: string,
  signers: D4SignSigner[],
): Promise<unknown> {
  return d4signPost(`/documents/${docUuid}/createlist`, config, { signers });
}

export async function d4signSendToSigner(
  config: D4SignClientConfig,
  docUuid: string,
): Promise<unknown> {
  return d4signPost(`/documents/${docUuid}/sendtosigner`, config, {
    skip_email: "0",
    workflow: "0",
    message: "",
  });
}

export async function d4signDownloadDocument(
  config: D4SignClientConfig,
  docUuid: string,
): Promise<{ url: string; name: string }> {
  return d4signPost(`/documents/${docUuid}/download`, config, {
    type: "pdf",
    language: "pt",
  });
}
