import { defaultDrainDeps } from "@/lib/pipeline/deps";
import { pushClockFromRequest } from "@/lib/push/clock";
import { handleDrain } from "@/lib/pipeline/drain";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Limite do Vercel Hobby; igual a DRAIN_MAX_DURATION_SEC (o drain para em 80%).
export const maxDuration = 60;

/** Worker das filas: chamado pelo pg_cron a cada minuto enquanto houver mensagens. */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  return handleDrain(req, defaultDrainDeps(pushClockFromRequest(req.headers)));
}
