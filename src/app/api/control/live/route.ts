import { canAccess } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { liveSnapshot } from "@/lib/db/queries/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Estado do Tempo real (O02) para o polling de 5 s da tela. Sessão do Estúdio com
 * `metrics.view`; IPs mascarados para quem não é admin.
 */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!canAccess(session.roles, "metrics.view")) return json({ error: "forbidden" }, 403);
  try {
    return json(await liveSnapshot({ maskIp: !controlAbilities(session.roles).admin }));
  } catch (e) {
    console.error("control live:", e instanceof Error ? e.message : e);
    return json({ error: "unavailable" }, 503);
  }
}
