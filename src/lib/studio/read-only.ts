import "server-only";
import type { DbClient } from "@/lib/db/client";

/**
 * Modo leitura (A15, architecture §9): com `feature_flags.read_only = true`, as Server Actions
 * do Estúdio param com mensagem e o portal segue lendo do cache. Só as ações de contingência
 * passam (`allowReadOnly`), senão ninguém desligaria o modo. Falha aberta na leitura da flag:
 * banco fora já derruba a ação por si.
 */
export const READ_ONLY_MESSAGE =
  "O Estúdio está em modo leitura: nenhuma alteração é gravada agora. Fale com a administração.";

export async function isReadOnly(db: DbClient): Promise<boolean> {
  try {
    const { data } = await db
      .from("feature_flags")
      .select("enabled")
      .eq("key", "read_only")
      .maybeSingle();
    return data?.enabled === true;
  } catch {
    return false;
  }
}
