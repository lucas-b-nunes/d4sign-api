import { prisma } from "@/lib/db";
import type {
  CoreDomain,
  CoreApp,
  CoreCredential,
  Setting,
  Instance,
  D4SignCredential,
} from "@/generated/prisma/client";
import type { AppAuth } from "@/lib/bitrix/bitrix24";

export type TenantApp = CoreApp & {
  credentials: CoreCredential | null;
  setting: Setting | null;
  instance: Instance | null;
  d4signCredential: D4SignCredential | null;
};

export type TenantWithApps = CoreDomain & {
  apps: TenantApp[];
};

export async function findTenantByMemberId(
  memberId: string,
): Promise<TenantWithApps | null> {
  return prisma.coreDomain.findFirst({
    where: { memberId },
    include: {
      apps: {
        include: {
          credentials: true,
          setting: true,
          instance: true,
          d4signCredential: true,
        },
      },
    },
  });
}

/** Retorna o primeiro (e geralmente único) app instalado do tenant. */
export function getFirstApp(tenant: TenantWithApps): TenantApp | null {
  return tenant.apps[0] ?? null;
}

/** Constrói um AppAuth a partir do domain + credential, para chamadas Bitrix. */
export function toAppAuth(domain: CoreDomain, cred: CoreCredential): AppAuth {
  return {
    domain: domain.name,
    accessToken: cred.accessToken ?? "",
    refreshToken: cred.refreshToken,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
  };
}
