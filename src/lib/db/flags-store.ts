import "server-only";
import {
  createFlagsService,
  isFlagKey,
  type FlagRow,
  type FlagsPort,
  type FlagsService,
} from "@/lib/flags";
import { err, ok } from "@/lib/result";
import type { DbClient } from "./client";

/** `feature_flags` com a sessão da pessoa: leitura pública, escrita só admin (RLS 0002 + 0035). */
export function supabaseFlagsPort(db: DbClient): FlagsPort {
  const map = (r: {
    key: string;
    enabled: boolean;
    updated_by: string | null;
    updated_at: string;
  }): FlagRow | null =>
    isFlagKey(r.key)
      ? { key: r.key, enabled: r.enabled, updatedBy: r.updated_by, updatedAt: r.updated_at }
      : null;
  return {
    async read(key) {
      const { data, error } = await db
        .from("feature_flags")
        .select("key, enabled, updated_by, updated_at")
        .eq("key", key)
        .maybeSingle();
      if (error) throw new Error(`feature_flags: ${error.message}`);
      return data ? map(data) : null;
    },
    async readAll() {
      const { data, error } = await db
        .from("feature_flags")
        .select("key, enabled, updated_by, updated_at")
        .order("key");
      if (error) throw new Error(`feature_flags: ${error.message}`);
      return (data ?? []).flatMap((r) => {
        const m = map(r);
        return m ? [m] : [];
      });
    },
    async write(key, value, actor) {
      const { data, error } = await db
        .from("feature_flags")
        .update({ enabled: value, updated_by: actor, updated_at: new Date().toISOString() })
        .eq("key", key)
        .select("key");
      if (error) {
        if (/exige aprovação/.test(error.message)) return err("needs_approval");
        if (error.code === "42501") return err("forbidden");
        return err("unavailable");
      }
      // 0 linhas: a RLS `feature_flags_write` escondeu a linha (não é admin).
      return (data ?? []).length > 0 ? ok(undefined) : err("forbidden");
    },
  };
}

export function createFlags(db: DbClient): FlagsService {
  return createFlagsService(supabaseFlagsPort(db));
}
