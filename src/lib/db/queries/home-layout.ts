import "server-only";
import { DEFAULT_HOME_MODULES, normalizeModules, type HomeModule } from "@/lib/home/modules";
import { many, readPublic } from "./run";
import { HOME_REVALIDATE } from "./home";

/**
 * Módulos da home na ordem publicada no Estúdio (A06). Leitura pública com a tag `home` (a
 * publicação a invalida). Qualquer falha, ou nada publicado, devolve o layout padrão: a home
 * nunca depende desta tabela para abrir.
 */
export async function getPublishedHomeModules(): Promise<HomeModule[]> {
  const r = await readPublic(
    async (db) =>
      many(await db.from("home_layouts").select("modules").eq("status", "published").limit(1)),
    { tags: ["home"], revalidate: HOME_REVALIDATE },
  );
  if (!r.ok) return [...DEFAULT_HOME_MODULES];
  const row = r.value[0];
  return row ? normalizeModules(row.modules) : [...DEFAULT_HOME_MODULES];
}
