export function usePrismaticBridge(): boolean {
  return process.env.USE_PRISMATIC_BRIDGE === "true";
}

export function useD4SignApi(): boolean {
  return process.env.ENABLE_D4SIGN_API !== "false";
}

export const featureFlags = {
  prismaticBridge: usePrismaticBridge(),
  d4signApi: useD4SignApi(),
} as const;
