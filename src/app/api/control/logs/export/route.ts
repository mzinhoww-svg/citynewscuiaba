import { canAccess } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { controlAbilities, parseLogFilters, toCsv } from "@/lib/control";
import { searchLogs } from "@/lib/db/queries/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Máximo de linhas por exportação. */
const MAX_ROWS = 1000;

/**
 * Exportação CSV dos logs (O08) com os mesmos filtros da tela. Sessão com `audit.view`; IPs
 * mascarados para quem não é admin; a exportação fica na auditoria (`logs.export`).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Entre para exportar.", { status: 401 });
  if (!canAccess(session.roles, "audit.view"))
    return new Response("Seu papel não permite exportar logs.", { status: 403 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { query } = parseLogFilters(params);
  const admin = controlAbilities(session.roles).admin;
  try {
    const rows = await searchLogs({ ...query, limit: MAX_ROWS }, { maskIp: !admin });
    await audit(session.userId, "logs.export", "logs:", { filters: query, rows: rows.length });
    const csv = toCsv(
      ["id", "quando", "ciclo", "etapa", "objeto", "nivel", "mensagem", "detalhes"],
      rows.map((r) => [
        r.id,
        r.at,
        r.runId ?? "",
        r.step,
        r.itemRef ?? "",
        r.level,
        r.message,
        JSON.stringify(r.details ?? {}),
      ]),
    );
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="citynews-logs-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("control logs export:", e instanceof Error ? e.message : e);
    return new Response("Não foi possível exportar agora. Tente de novo.", { status: 503 });
  }
}
