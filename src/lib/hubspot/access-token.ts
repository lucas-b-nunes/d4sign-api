import { prisma } from "@/lib/db";
import { refreshHubspotToken } from "@/lib/hubspot/client";

/** Renova o token ~1 min antes de expirar (tokens HubSpot duram ~30 min). */
const EXPIRY_BUFFER_MS = 60_000;

export type HubspotCredentialForToken = {
  appId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  refreshToken: string;
  expiresAt: Date;
};

function isAccessTokenValid(cred: HubspotCredentialForToken): boolean {
  return Boolean(
    cred.accessToken &&
      cred.expiresAt.getTime() > Date.now() + EXPIRY_BUFFER_MS,
  );
}

/** Retorna access token HubSpot válido, renovando via OAuth quando necessário. */
export async function ensureValidHubspotAccessToken(
  cred: HubspotCredentialForToken,
): Promise<string | null> {
  if (isAccessTokenValid(cred)) {
    return cred.accessToken!;
  }

  const tok = await refreshHubspotToken({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    refreshToken: cred.refreshToken,
  });

  if (!tok?.access_token) {
    return cred.accessToken ?? null;
  }

  const expiresAt = new Date(Date.now() + tok.expires_in * 1000);

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
