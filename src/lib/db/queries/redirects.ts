import "server-only";
import { normalizePath, type Redirect } from "@/lib/seo/redirects";
import { readPublic } from "./run";

/** Redirecionamentos (A08): leitura pública com cache de 5 minutos na tag `redirects`. */
const CACHE = { tags: ["redirects"], revalidate: 300 };

/** Destino de um caminho, ou `null` (também quando o banco está fora: a página segue). */
export async function findRedirect(path: string): Promise<Redirect | null> {
  const p = normalizePath(path);
  const r = await readPublic(async (db) => {
    const { data, error } = await db
      .from("redirects")
      .select("from_path, to_path, kind")
      .eq("from_path", p)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, CACHE);
  if (!r.ok || !r.value) return null;
  return {
    fromPath: r.value.from_path,
    toPath: r.value.to_path,
    kind: r.value.kind === 302 ? 302 : 301,
  };
}
