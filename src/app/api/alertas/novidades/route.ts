import { NextResponse } from "next/server";
import { listAlertItems } from "@/lib/db/queries";

/**
 * Novidades para os alertas de navegador (P18): o navegador pergunta o que saiu desde a última
 * checagem e decide sozinho o que avisar (os alertas ficam só nele, sem conta e sem id).
 * Sem banco, lista vazia.
 */
export async function GET(req: Request) {
  const desde = new URL(req.url).searchParams.get("desde");
  const since = desde && !Number.isNaN(Date.parse(desde)) ? new Date(desde) : new Date(0);
  const r = await listAlertItems(since);
  return NextResponse.json(
    { items: r.ok ? r.value : [], at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
