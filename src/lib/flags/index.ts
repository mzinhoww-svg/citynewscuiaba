/**
 * Flags de contingência (A15, architecture §9): `auto_publish`, `read_only`, `ai_enabled` e
 * as demais de `feature_flags`. Domínio puro sobre uma porta: a tela e as ações usam
 * `getFlag`/`setFlag`; o pipeline continua lendo pela porta `Flags` de `src/lib/pipeline/ports`.
 * Falha fechada: flag ausente ou erro de leitura conta como desligada.
 */
import { err, ok, type Result } from "@/lib/result";

export const FLAG_KEYS = [
  "auto_publish",
  "read_only",
  "ai_enabled",
  "personalization_enabled",
  "image_reproduction_enabled",
  "source_link_analysis",
  "sponsored_native_enabled",
  "ads_enabled",
  "hot_featured_enabled",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const isFlagKey = (k: string): k is FlagKey => (FLAG_KEYS as readonly string[]).includes(k);

export interface FlagRow {
  key: FlagKey;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export type SetFlagError = "forbidden" | "needs_approval" | "not_found" | "unavailable";

export interface FlagsPort {
  read(key: FlagKey): Promise<FlagRow | null>;
  readAll(): Promise<FlagRow[]>;
  /** Grava em nome de `actor`; o banco aplica RLS (admin) e `guard_feature_flags`. */
  write(key: FlagKey, value: boolean, actor: string): Promise<Result<void, SetFlagError>>;
}

export interface FlagsService {
  getFlag(key: FlagKey): Promise<boolean>;
  getAll(): Promise<FlagRow[]>;
  /** Idempotente: já no valor pedido devolve `changed: false` sem gravar. */
  setFlag(
    key: FlagKey,
    value: boolean,
    actor: string,
  ): Promise<Result<{ changed: boolean }, SetFlagError>>;
}

export function createFlagsService(port: FlagsPort): FlagsService {
  return {
    async getFlag(key) {
      try {
        return (await port.read(key))?.enabled ?? false;
      } catch {
        return false;
      }
    },
    getAll: () => port.readAll(),
    async setFlag(key, value, actor) {
      const current = await port.read(key);
      if (!current) return err("not_found");
      if (current.enabled === value) return ok({ changed: false });
      const r = await port.write(key, value, actor);
      return r.ok ? ok({ changed: true }) : r;
    },
  };
}
