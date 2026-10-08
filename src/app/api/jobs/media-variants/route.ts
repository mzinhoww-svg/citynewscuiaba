import { createServiceClient } from "@/lib/db/client";
import { backfillVariants } from "@/lib/media/backfill";
import { makeVariants } from "@/lib/media/make-variants";
import { productionMediaStore } from "@/lib/pipeline/deps";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LIMIT = 40;

/**
 * Variantes das imagens antigas (A-155), `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * `?offset=N&limit=M` (até 40 por chamada); a resposta traz `nextOffset` para a próxima chamada.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
  );
  const db = createServiceClient();
  const report = await backfillVariants(
    {
      async page(o, l) {
        const { data, error } = await db
          .from("media_assets")
          .select("id, storage_path")
          .neq("status", "blocked")
          .order("captured_at", { ascending: true })
          .order("id", { ascending: true })
          .range(o, o + l - 1);
        if (error) throw new Error(`media_assets: ${error.message}`);
        return (data ?? []).map((r) => ({ id: r.id, storagePath: r.storage_path }));
      },
      store: productionMediaStore(db),
      make: makeVariants,
    },
    offset,
    limit,
  );
  return Response.json({ status: "done", ...report });
}
