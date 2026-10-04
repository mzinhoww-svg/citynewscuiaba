import { createServiceClient } from "@/lib/db/client";
import { lastLogoCheckAt, runSourceLogoSync } from "@/lib/db/source-logo-run";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Intervalo mínimo entre chamadas automáticas (o pg_cron chama de hora em hora às segundas). */
const MIN_INTERVAL_MS = 20 * 60_000;
const MAX_LIMIT = 8;
const DEFAULT_LIMIT = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Logotipos das fontes (LOGO-T1, R27). `POST` com `Authorization: Bearer ${CRON_SECRET}`.
 * Cada chamada trata poucas fontes (`?limit=`, padrão 3, no máximo 8) e é idempotente: quem já foi
 * tentado só volta no prazo (7 dias sem logotipo, 30 para renovar). `?force=1` ignora o intervalo
 * mínimo de 20 min (execução manual em lote); `?dry=1` só relata (com `&skip=N` para andar na fila); `?id=<fonte>` trata uma fonte.
 * Logotipo enviado por uma pessoa (`logo_source = 'manual'`) nunca é sobrescrito.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const id = url.searchParams.get("id") ?? undefined;
  if (id !== undefined && !UUID.test(id))
    return Response.json({ error: "invalid_id" }, { status: 400 });
  const skip = Number(url.searchParams.get("skip"));
  const asked = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

  const db = createServiceClient();
  if (!dry && !force && !id) {
    const last = await lastLogoCheckAt(db);
    if (last && Date.now() - last.getTime() < MIN_INTERVAL_MS) {
      return Response.json({
        status: "skipped",
        reason: "recent",
        lastCheckAt: last.toISOString(),
      });
    }
  }
  const report = await runSourceLogoSync({
    db,
    limit,
    dry,
    skip: dry && Number.isInteger(skip) && skip > 0 ? skip : undefined,
    sourceId: id,
    signal: AbortSignal.timeout(55_000),
  });
  return Response.json({ status: "done", dry, ...report });
}
