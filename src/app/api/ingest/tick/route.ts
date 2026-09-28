import { defaultTickDeps } from "@/lib/pipeline/deps";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { handleTick } from "@/lib/pipeline/tick";
import { publishDueScheduled } from "@/lib/studio/publish";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Etapa 1: chamado pelo pg_cron (pg_net) e pelo watchdog do GitHub. */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  // Agendadas do Estúdio que venceram (P4-T5): publica e invalida o cache (inclusive das que
  // o pg_cron publicou antes, pendentes em studio_revalidations) antes do ciclo.
  await publishDueScheduled(revalidateTags).catch((e: unknown) =>
    console.error("agendadas:", e instanceof Error ? e.message : e),
  );
  return handleTick(req, defaultTickDeps());
}
