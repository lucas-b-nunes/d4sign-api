import { prisma } from "@/lib/db";
import { refreshBitrixToken } from "@/lib/bitrix/bitrix24";

/** Busca credenciais expiradas e renova os tokens via OAuth Bitrix. */
export async function runTokenRefreshJob(): Promise<void> {
  let expired: Awaited<ReturnType<typeof prisma.coreCredential.findMany>>;
  try {
    expired = await prisma.coreCredential.findMany({
      where: { expiresAt: { lte: new Date() } },
    });
  } catch (err) {
    console.error("[token-refresh] Erro ao buscar credenciais:", err);
    return;
  }

  if (expired.length === 0) return;

  console.log(`[token-refresh] Renovando ${expired.length} credencial(is) expirada(s)...`);

  for (const cred of expired) {
    try {
      const tok = await refreshBitrixToken({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
      });

      if (!tok?.access_token) {
        console.warn(`[token-refresh] Falha ao renovar credencial appId=${cred.appId}`);
        continue;
      }

      const expiresAt = new Date(
        Date.now() + ((tok.expires ?? 3600) * 1000),
      );

      await prisma.coreCredential.update({
        where: { id: cred.id },
        data: {
          accessToken: tok.access_token,
          refreshToken: tok.refresh_token ?? cred.refreshToken,
          expiresAt,
        },
      });

      console.log(`[token-refresh] Renovado com sucesso: appId=${cred.appId}`);
    } catch (err) {
      console.error(`[token-refresh] Erro ao renovar appId=${cred.appId}:`, err);
    }
  }
}
