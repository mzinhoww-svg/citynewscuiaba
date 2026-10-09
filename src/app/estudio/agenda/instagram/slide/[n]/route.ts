import { getSession } from "@/lib/auth/require-role";
import { socialSlide, weekStartOf } from "@/lib/studio/social-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prévia de um slide do pacote do Instagram (ARD-T6): o PNG sai do bucket privado
 * `social-packages` só para quem tem a editoria Agenda (`?semana=AAAA-MM-DD`, `n` a partir de 1).
 * Sem sessão: 401; sem papel: 403; slide inexistente: 404. Nunca em cache compartilhado.
 */
export async function GET(req: Request, { params }: { params: Promise<{ n: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sem sessão", { status: 401 });
  const { n } = await params;
  const index = /^\d{1,2}$/.test(n) ? Number(n) - 1 : -1;
  const week = weekStartOf(new URL(req.url).searchParams.get("semana"));
  if (index < 0 || !week) return new Response("Slide não encontrado", { status: 404 });
  const r = await socialSlide(week, index);
  if (!r.ok)
    return new Response(r.error === "forbidden" ? "Sem permissão" : "Slide não encontrado", {
      status: r.error === "forbidden" ? 403 : 404,
    });
  const body = new Uint8Array(r.value);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(body.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
