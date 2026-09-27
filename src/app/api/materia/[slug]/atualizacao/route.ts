import { getArticleUpdatedAt } from "@/lib/db/queries";

/**
 * `updated_at` público da matéria, para o aviso "Esta matéria foi atualizada às hh:mm"
 * (polling de 120 s em UpdatedWhileReading). Nunca em cache.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { "Cache-Control": "no-store" };
  const result = await getArticleUpdatedAt(slug);
  if (!result.ok) return Response.json({ updatedAt: null }, { status: 503, headers });
  if (!result.value) return Response.json({ updatedAt: null }, { status: 404, headers });
  return Response.json({ updatedAt: result.value }, { headers });
}
