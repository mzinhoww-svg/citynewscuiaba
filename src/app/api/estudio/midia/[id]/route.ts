import { getSession } from "@/lib/auth/require-role";
import { createServerClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";
import { mediaServeDeps } from "@/lib/db/media-serve";
import { serveMedia } from "@/lib/media/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response("Imagem não encontrada", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

/**
 * Prévia de imagem no Estúdio (E09/E10): qualquer estado (pendente, aprovada, bloqueada), só
 * para quem tem papel no Estúdio. Mesmo bucket privado da rota pública; nunca em cache público.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.roles.length === 0) return notFound();
  const { id } = await params;
  let deps;
  try {
    deps = mediaServeDeps();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return notFound();
    throw e;
  }
  const db = await createServerClient();
  const res = await serveMedia(id, {
    ...deps,
    async asset(x) {
      const { data } = await db
        .from("media_assets")
        .select("id, kind, storage_path, content_type")
        .eq("id", x)
        .maybeSingle();
      return data
        ? {
            id: data.id,
            kind: data.kind,
            status: "approved",
            storagePath: data.storage_path,
            contentType: data.content_type,
          }
        : null;
    },
    reproductionEnabled: async () => true,
  });
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, headers });
}
