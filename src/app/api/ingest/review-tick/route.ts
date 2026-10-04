import { defaultReviewDeps, defaultTopicSweep } from "@/lib/pipeline/deps";
import { runReviewTick } from "@/lib/pipeline/steps/auto-reviewer";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revisor automático (AUT-T6): a cada 5 min o pg_cron (e o watchdog do GitHub) chama esta rota.
 * Lê as matérias em revisão vencidas (`due_at`: urgente 10 min, demais 30 min) e decide
 * `publish`, `hold` ou `archive` com justificativa em `decisions`. Fora da janela do modo
 * (`night`: 20h às 6h em America/Cuiaba), com o modo `off`, com a publicação automática desligada
 * ou com o orçamento de IA esgotado, não faz nada e a fila segue com a pessoa.
 */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const result = await runReviewTick(defaultReviewDeps());
  // Assuntos sem novidade há 7 dias passam a `encerrado` (AUT-T7); independe do modo do revisor.
  const topicsClosed = await defaultTopicSweep()().catch(() => null);
  return Response.json({ ...result, topicsClosed });
}
