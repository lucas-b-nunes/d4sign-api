/** Monta `/bitrix/login` com os parâmetros que o Bitrix envia (GET ou POST). */
export function bitrixLoginRedirectUrl(
  origin: string,
  fields: Map<string, string>,
): URL {
  const url = new URL("/bitrix/login", origin.replace(/\/$/, ""));
  for (const [k, v] of fields) {
    if (v) url.searchParams.set(k, v);
  }
  return url;
}
