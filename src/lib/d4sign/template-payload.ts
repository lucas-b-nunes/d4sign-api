/** Monta payload interno de templates.{id} para a D4Sign. */
export function buildD4SignTemplatePayload(
  resolved: Record<string, string>,
): Record<string, unknown> {
  const root: Record<string, string> = {};
  const preenchedor: Record<string, string> = {};

  for (const [key, value] of Object.entries(resolved)) {
    if (key.startsWith("preenchedor.")) {
      preenchedor[key.slice("preenchedor.".length)] = value;
    } else {
      root[key] = value;
    }
  }

  // Variáveis do grupo preenchedor ficam SOMENTE dentro de preenchedor.{}
  for (const key of Object.keys(preenchedor)) {
    delete root[key];
  }

  const payload: Record<string, unknown> = { ...root };
  if (Object.keys(preenchedor).length > 0) {
    payload.preenchedor = preenchedor;
  }

  return payload;
}
