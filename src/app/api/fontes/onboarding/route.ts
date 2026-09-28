import { getSourceSignals } from "@/lib/db/queries";
import { pickOnboardingSources } from "@/lib/anon/invites";

/**
 * Seletor da primeira visita (P23): 12 fontes (6 locais, 3 estaduais, 3 temáticas) pela
 * popularidade da semana, sem nada individual. Sem banco, 503 (o painel mostra "Tentar de novo").
 */
export async function GET() {
  const r = await getSourceSignals({ window: "7d" });
  if (!r.ok) return Response.json({ sources: [] }, { status: 503 });
  const sources = pickOnboardingSources(
    r.value
      .filter((s) => !s.excluded && !s.blocked)
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        locality: s.locality,
        categories: s.categories,
        score: s.popularity,
      })),
  ).map(({ slug, name, group }) => ({ slug, name, group }));
  return Response.json({ sources }, { headers: { "Cache-Control": "public, max-age=300" } });
}
