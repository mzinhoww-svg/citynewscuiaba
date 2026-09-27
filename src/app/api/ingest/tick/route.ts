import { defaultTickDeps } from "@/lib/pipeline/deps";
import { handleTick } from "@/lib/pipeline/tick";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Etapa 1: chamado pelo pg_cron (pg_net) e pelo watchdog do GitHub. */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  return handleTick(req, defaultTickDeps());
}
