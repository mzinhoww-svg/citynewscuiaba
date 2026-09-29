import { defaultFastTickDeps } from "@/lib/pipeline/deps";
import { handleFastTick } from "@/lib/pipeline/fast-tick";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tick rápido (spec §7.8): chamado a cada 10 min pelo pg_cron (pg_net) e pelo watchdog do GitHub
 * quando o último run `fast` passou de 15 min. Sem parâmetros: a lista de fontes vem do banco.
 */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  return handleFastTick(req, defaultFastTickDeps());
}
