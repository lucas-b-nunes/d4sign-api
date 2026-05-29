import { d4signListSafes, d4signPing } from "@/lib/d4sign/client";
import type { ISignatureAdapter } from "./types";

export function createD4SignAdapter(config: {
  tokenApi: string;
  cryptKey?: string | null;
}): ISignatureAdapter {
  return {
    provider: "d4sign",
    async ping() {
      const r = await d4signPing(config);
      return { ok: r.ok };
    },
    async listSafes() {
      return d4signListSafes(config);
    },
    async sendDocument() {
      throw new Error(
        "sendDocument: implementar upload + createlist + sendtosigner (Fase 2)",
      );
    },
  };
}
