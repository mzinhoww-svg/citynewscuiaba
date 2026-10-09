import { getSession } from "@/lib/auth/require-role";
import { socialZip, weekStartOf } from "@/lib/studio/social-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Baixar ZIP" do pacote do Instagram (ARD-T6): só depois de aprovado, só para quem tem a
 * editoria Agenda. PNGs + `caption.txt` + `creditos.txt`. Sem sessão: 401; sem papel: 403;
 * antes da aprovação: 409; sem pacote: 404.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Sem sessão", { status: 401 });
  const week = weekStartOf(new URL(req.url).searchParams.get("semana"));
  if (!week) return new Response("Semana inválida", { status: 400 });
  const r = await socialZip(week);
  if (!r.ok) {
    const status = r.error === "forbidden" ? 403 : r.error === "not_ready" ? 409 : 404;
    return new Response(status === 409 ? "Aprove o pacote antes de baixar" : "Indisponível", {
      status,
    });
  }
  const body = new Uint8Array(r.value.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(body.byteLength),
      "content-disposition": `attachment; filename="${r.value.fileName}"`,
      "cache-control": "private, no-store",
    },
  });
}
