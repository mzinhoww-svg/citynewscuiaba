import { defaultStatusDeps } from "@/lib/pipeline/deps";
import { handleStatus } from "@/lib/pipeline/status";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado do ciclo para o watchdog (`.github/workflows/cron-watchdog.yml`): último início, atraso
 * (> 45 min) e mensagens na fila. Exige o segredo de cron como as demais rotas de worker.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  return handleStatus(req, defaultStatusDeps());
}
