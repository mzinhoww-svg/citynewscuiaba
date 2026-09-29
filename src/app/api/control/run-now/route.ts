import { z } from "zod";
import { getSession } from "@/lib/auth/require-role";
import { ReprocessError, runNow } from "@/lib/pipeline/reprocess";
import { isSameOrigin } from "@/lib/security/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const Body = z.object({ sourceId: z.string().uuid().optional() }).strict();
const STATUS = { forbidden: 403, invalid: 400, not_found: 404, conflict: 409 } as const;

/**
 * "Executar agora" (O01/O02). Autenticação por sessão e papel (`source.manage`), nunca pelo
 * segredo de cron: quem chama é uma pessoa, e a ação fica auditada em nome dela.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req))
    return Response.json({ error: "origin" }, { status: 403, headers: NO_STORE });
  const session = await getSession();
  if (!session)
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });

  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
    }
  }
  const body = Body.safeParse(raw);
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });

  try {
    const r = await runNow(body.data.sourceId ? { sourceId: body.data.sourceId } : {});
    return Response.json(r, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ReprocessError)
      return Response.json(
        { error: e.code, message: e.message },
        { status: STATUS[e.code], headers: NO_STORE },
      );
    console.error("control run-now:", e instanceof Error ? e.message : e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
