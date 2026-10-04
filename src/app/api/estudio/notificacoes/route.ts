import { getSession } from "@/lib/auth/require-role";
import { BELL_LIMIT, loadSnapshot } from "@/lib/db/queries/studio-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Lista do sino (e contagem de não lidas) para a pessoa da sessão; o banco recorta pelo papel. */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session || session.roles.length === 0)
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const r = await loadSnapshot(BELL_LIMIT);
  if (!r.ok) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return Response.json(r.value, { headers: NO_STORE });
}
