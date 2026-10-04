import { createServiceClient } from "@/lib/db/client";
import { createAutonomySweepPort } from "@/lib/db/autonomy-store";
import { runAutonomySweep } from "@/lib/pipeline/autonomy-sweep";
import { defaultReviewDeps, defaultTopicSweep } from "@/lib/pipeline/deps";
import { runReviewTick } from "@/lib/pipeline/steps/auto-reviewer";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Varredura de autonomia (A-151) e revisor automático (AUT-T6): a cada 5 min o pg_cron (e o watchdog do GitHub) chama esta rota.
 * Lê as matérias em revisão vencidas (`due_at`: urgente 10 min, demais 30 min) e decide
 * `publish`, `hold` ou `archive` com justificativa em `decisions`. Fora da janela do modo
 * (`night`: 20h às 6h em America/Cuiaba), com o modo `off`, com a publicação automática desligada
 * ou com o orçamento de IA esgotado, não faz nada e a fila segue com a pessoa.
 */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  // Varredura de autonomia (A-151) antes do revisor: disjuntor que se recupera, matérias com
  // próxima ação vencida, itens mortos e incidentes. Falha aqui não impede o revisor.
  const autonomy = await runAutonomySweep(
    createAutonomySweepPort(createServiceClient()),
    new Date(),
  ).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  const result = await runReviewTick(defaultReviewDeps());
  // Assuntos sem novidade há 7 dias passam a `encerrado` (AUT-T7); independe do modo do revisor.
  const topicsClosed = await defaultTopicSweep()().catch(() => null);
  return Response.json({ ...result, topicsClosed, autonomy });
}
