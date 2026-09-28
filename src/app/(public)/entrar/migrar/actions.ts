"use server";

import { planMigration, type MigrationChoice } from "@/lib/anon/migrate";
import { normalizeProfile } from "@/lib/anon/store";
import { getReader } from "@/lib/auth/reader";
import { applyMigration, readRemoteAccountData } from "@/lib/db/account";

export type MigrateResult =
  { ok: true; summary: string } | { ok: false; reason: "session" | "error" };

const KEYS: (keyof MigrationChoice)[] = [
  "follows",
  "saved",
  "interests",
  "history",
  "conversations",
];

/**
 * C06 · Leva o perfil deste navegador para a conta. O perfil chega do navegador (não confiável):
 * passa pela mesma normalização do IndexedDB antes de virar plano. Grava com a sessão do leitor
 * (RLS: só na própria conta) e nunca duplica o que a conta já tem.
 */
export async function migrateAction(local: unknown, choice: unknown): Promise<MigrateResult> {
  const reader = await getReader();
  if (!reader) return { ok: false, reason: "session" };
  const c = (typeof choice === "object" && choice !== null ? choice : {}) as Record<
    string,
    unknown
  >;
  const picked = Object.fromEntries(
    KEYS.map((k) => [k, c[k] === true]),
  ) as unknown as MigrationChoice;
  const profile = normalizeProfile(local, new Date());
  try {
    const remote = await readRemoteAccountData(reader.db, reader.user.id);
    const plan = planMigration(profile, remote, picked);
    await applyMigration(reader.db, reader.user.id, plan, profile);
    return { ok: true, summary: plan.summary };
  } catch {
    return { ok: false, reason: "error" };
  }
}
