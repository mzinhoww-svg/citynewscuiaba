import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { queryLogs } from "@/lib/db/queries/control";
import { audit } from "@/lib/audit";
import { csvCell, EXPORT_LIMIT } from "@/lib/control/csv";
import { logFiltersFrom } from "@/lib/control/log-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Exporta os logs filtrados (até 5.000 eventos). IPs mascarados para quem não é admin. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  if (!canAccess(session.roles, "metrics.view"))
    return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  const { filters, order } = logFiltersFrom(Object.fromEntries(new URL(req.url).searchParams));
  try {
    const { rows } = await queryLogs(filters, 1, EXPORT_LIMIT, order === "asc");
    await audit(session.userId, "metrics.view", "logs:export", { rows: rows.length, filters }).catch(
      () => undefined,
    );
    const head = ["quando", "ciclo", "etapa", "item", "nivel", "mensagem", "detalhes"];
    const lines = [
      head.map(csvCell).join(","),
      ...rows.map((e) =>
        [e.at, e.runId, e.step, e.itemRef, e.level, e.message, e.details].map(csvCell).join(","),
      ),
    ];
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="citynews-logs.csv"',
      },
    });
  } catch (e) {
    console.error("control logs export:", e instanceof Error ? e.message : e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
