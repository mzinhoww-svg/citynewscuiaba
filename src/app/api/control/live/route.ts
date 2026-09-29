import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { liveSnapshot } from "@/lib/db/queries/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Retrato do motor para o polling de 5 s do tempo real. Exige sessão e papel de métricas. */
export async function GET() {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  if (!canAccess(session.roles, "metrics.view"))
    return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  try {
    return Response.json(await liveSnapshot(), { headers: NO_STORE });
  } catch (e) {
    console.error("control live:", e instanceof Error ? e.message : e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
