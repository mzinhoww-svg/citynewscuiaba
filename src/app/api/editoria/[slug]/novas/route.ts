import { countSectionSince } from "@/lib/db/queries";
import { parseSectionFilters } from "@/lib/filters/section";

/**
 * Contagem de matérias novas da editoria desde `?desde=` (ISO), com os mesmos filtros da página.
 * Usada pela pílula "n novas matérias" (polling de 60 s). Nunca em cache.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const since = new Date(url.searchParams.get("desde") ?? "");
  const headers = { "Cache-Control": "no-store" };
  if (Number.isNaN(since.getTime())) {
    return Response.json({ error: "desde inválido" }, { status: 400, headers });
  }
  const result = await countSectionSince(
    slug,
    parseSectionFilters(url.searchParams),
    since.toISOString(),
  );
  if (!result.ok) return Response.json({ count: 0 }, { headers });
  if (result.value === null) {
    return Response.json({ error: "editoria desconhecida" }, { status: 404, headers });
  }
  return Response.json({ count: result.value }, { headers });
}
