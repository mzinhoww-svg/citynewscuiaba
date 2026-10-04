import { z } from "zod";
import { getSession } from "@/lib/auth/require-role";
import { markAllRead, markRead } from "@/lib/db/queries/studio-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const body = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
]);

/** Só aceita pedido da própria origem (cookie de sessão + `fetch` do Estúdio). */
function sameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Marca como lidas as notificações da própria pessoa (`{ ids }` ou `{ all: true }`). */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req))
    return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const session = await getSession();
  if (!session || session.roles.length === 0)
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  const r = "all" in parsed.data ? await markAllRead() : await markRead(parsed.data.ids);
  if (!r.ok) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return Response.json({ marked: r.value }, { headers: NO_STORE });
}
