import "server-only";
import { studioContext } from "@/lib/studio/context";

/*
 * Fontes que a última rodada da via rápida deixou de fora por falta de vaga (`fast_lane_full`,
 * A-113). O tick grava `skipped: [{ slug, reason }]` em `ingest_runs.stats`; a lista lê só o
 * run rápido mais recente e devolve os nomes. Falha de leitura não derruba a tela: devolve [].
 */

export function fastLaneFullSlugs(stats: unknown): string[] {
  if (typeof stats !== "object" || stats === null || Array.isArray(stats)) return [];
  const skipped = (stats as { skipped?: unknown }).skipped;
  if (!Array.isArray(skipped)) return [];
  const slugs: string[] = [];
  for (const s of skipped) {
    if (typeof s !== "object" || s === null) continue;
    const { slug, reason } = s as { slug?: unknown; reason?: unknown };
    if (reason === "fast_lane_full" && typeof slug === "string" && !slugs.includes(slug))
      slugs.push(slug);
  }
  return slugs;
}

export async function fastLaneSkippedNames(): Promise<string[]> {
  try {
    const { db } = await studioContext();
    const run = await db
      .from("ingest_runs")
      .select("stats")
      .eq("trigger", "fast")
      .order("window_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run.error || !run.data) return [];
    const slugs = fastLaneFullSlugs(run.data.stats);
    if (slugs.length === 0) return [];
    const names = await db.from("sources").select("slug, name").in("slug", slugs);
    if (names.error) return [];
    const byslug = new Map((names.data ?? []).map((s) => [s.slug, s.name]));
    return slugs.map((s) => byslug.get(s) ?? s);
  } catch {
    return [];
  }
}
