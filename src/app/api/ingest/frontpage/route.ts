import { defaultFrontpageDeps } from "@/lib/pipeline/deps";
import { runHotPins } from "@/lib/pipeline/hot-pins";
import { runFrontpage } from "@/lib/pipeline/steps/frontpage";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prazo duro das requisições: `maxDuration` menos a folga para gravar e responder. */
const HARD_LIMIT_MS = 50_000;

/**
 * Topo da página inicial das fontes (HOT-T2, spec 2026-10-03-destaques-e-profundidade R9): o
 * pg_cron (`ingest-frontpage`, a cada 20 min, migration 0154) chama esta rota. Roda o passo direto,
 * como o `review-tick`, sem passar pela fila: é um lote curto (robots.txt + 1 GET por fonte, 4 por
 * vez, nenhuma fonte nova depois de 35 s) que não gera trabalho para as etapas seguintes.
 */
export async function POST(req: Request): Promise<Response> {
  // Autoriza antes de montar dependências: sem segredo, nada toca o banco nem a rede.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const report = await runFrontpage(defaultFrontpageDeps(AbortSignal.timeout(HARD_LIMIT_MS)));
  // Sinal novo acabou de chegar: a pauta quente vira destaque já (HOT-T3). Falha não derruba a rota.
  const hot = await runHotPins("frontpage");
  return Response.json({ ...report, hot });
}
