import { prisma } from "@/lib/db";
import { refreshBitrixToken } from "@/lib/bitrix/bitrix24";

/** Renova o token ~1 min antes de expirar. */
const EXPIRY_BUFFER_MS = 60_000;

export type BitrixCredentialForToken = {
  appId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  refreshToken: string;
  expiresAt: Date;
};

function isAccessTokenValid(cred: BitrixCredentialForToken): boolean {
  return Boolean(
    cred.accessToken &&
      cred.expiresAt.getTime() > Date.now() + EXPIRY_BUFFER_MS,
  );
}

/** Retorna access token válido, renovando via OAuth apenas quando necessário. */
export async function ensureValidAccessToken(
  cred: BitrixCredentialForToken,
): Promise<string | null> {
  if (isAccessTokenValid(cred)) {
    return cred.accessToken!;
  }

  const tok = await refreshBitrixToken({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    refreshToken: cred.refreshToken,
  });

  if (!tok?.access_token) {
    return cred.accessToken ?? null;
  }

  const expiresAt = new Date(Date.now() + (tok.expires ?? 3600) * 1000);

  await prisma.coreCredential.update({
    where: { appId: cred.appId },
    data: {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? cred.refreshToken,
      expiresAt,
    },
  });

  return tok.access_token;
}
