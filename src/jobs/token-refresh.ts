import { prisma } from "@/lib/db";
import { refreshBitrixToken } from "@/lib/bitrix/bitrix24";
import { refreshHubspotToken } from "@/lib/hubspot/client";

/** Busca credenciais expiradas e renova os tokens via OAuth da plataforma. */
export async function runTokenRefreshJob(): Promise<void> {
  let expired: Awaited<
    ReturnType<
      typeof prisma.coreCredential.findMany<{
        include: { app: { include: { domain: true } } };
      }>
    >
  >;
  try {
    expired = await prisma.coreCredential.findMany({
      where: { expiresAt: { lte: new Date() } },
      include: { app: { include: { domain: true } } },
    });
  } catch (err) {
    console.error("[token-refresh] Erro ao buscar credenciais:", err);
    return;
  }

  if (expired.length === 0) return;

  console.log(`[token-refresh] Renovando ${expired.length} credencial(is) expirada(s)...`);

  for (const cred of expired) {
    const platform = cred.app.domain.platform;
    try {
      let accessToken: string | undefined;
      let refreshToken: string | undefined;
      let expiresInSec: number | undefined;

      if (platform === "HUBSPOT") {
        const tok = await refreshHubspotToken({
          clientId: cred.clientId,
          clientSecret: cred.clientSecret,
          refreshToken: cred.refreshToken,
        });
        accessToken = tok?.access_token;
        refreshToken = tok?.refresh_token;
        expiresInSec = tok?.expires_in;
      } else {
        const tok = await refreshBitrixToken({
          clientId: cred.clientId,
          clientSecret: cred.clientSecret,
          refreshToken: cred.refreshToken,
        });
        accessToken = tok?.access_token;
        refreshToken = tok?.refresh_token;
        expiresInSec = tok?.expires;
      }

      if (!accessToken) {
        console.warn(
          `[token-refresh] Falha ao renovar credencial appId=${cred.appId} (${platform})`,
        );
        continue;
      }

      const expiresAt = new Date(Date.now() + (expiresInSec ?? 3600) * 1000);

      await prisma.coreCredential.update({
        where: { id: cred.id },
        data: {
          accessToken,
          refreshToken: refreshToken ?? cred.refreshToken,
          expiresAt,
        },
      });

      console.log(`[token-refresh] Renovado com sucesso: appId=${cred.appId} (${platform})`);
    } catch (err) {
      console.error(`[token-refresh] Erro ao renovar appId=${cred.appId} (${platform}):`, err);
    }
  }
}
