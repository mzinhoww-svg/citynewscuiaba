import { mediaServeDeps } from "@/lib/db/media-serve";
import { SupabaseEnvError } from "@/lib/db/env";
import { parseWidthParam, serveMedia } from "@/lib/media/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Imagem aprovada (ADR-009): valida `approved` e a flag de reprodução e redireciona para URL
 * assinada curta do bucket privado `media`. `?w=` escolhe a variante por largura (item 79), com
 * o original de reserva. Sem banco, 404.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let deps;
  try {
    deps = mediaServeDeps();
  } catch (e) {
    if (e instanceof SupabaseEnvError)
      return new Response("Imagem indisponível", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    throw e;
  }
  const width = parseWidthParam(new URL(req.url).searchParams.get("w"));
  return serveMedia(id, deps, { width });
}
