import { getSession } from "@/lib/auth/require-role";
import { canAccess } from "@/lib/auth";
import { historyCsv, parseHistoryFilter } from "@/lib/db/queries/push-admin";

export const dynamic = "force-dynamic";

/**
 * Exportar CSV do histórico (spec §10.4): mesmos filtros da tela, `Content-Disposition` de
 * download, nenhum dado de inscrição. Só leitura; quem não tem papel de push recebe 404.
 */
export async function GET(req: Request) {
  const session = await getSession();
  const allowed =
    session &&
    (["push.request", "push.approve", "push.settings"] as const).some((a) =>
      canAccess(session.roles, a),
    );
  if (!allowed) return new Response(null, { status: 404 });
  const filter = parseHistoryFilter(new URL(req.url).searchParams);
  const { csv, truncated } = await historyCsv(filter);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="notificacoes-${day}.csv"`,
      "cache-control": "no-store",
      ...(truncated ? { "x-export-truncated": "1" } : {}),
    },
  });
}
