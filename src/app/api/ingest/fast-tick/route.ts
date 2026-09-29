import { defaultFastTickDeps } from "@/lib/pipeline/deps";
import { handleFastTick } from "@/lib/pipeline/fast-tick";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tick da via rápida (spec §7.8): chamado a cada 10 min pelo pg_cron (pg_net) e pelo watchdog do
 * GitHub. Só enfileira o `fetch` das fontes com frequência efetiva abaixo de 30 min.
 */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  return handleFastTick(req, defaultFastTickDeps());
}
