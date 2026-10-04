import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { createHotPinRepo } from "@/lib/db/hot-pin-store";
import { applyHotPins, type HotPinReport } from "@/lib/featured/hot-pin";
import { revalidateTags } from "./revalidate";

/**
 * Pauta quente (HOT-T3) com falha isolada: roda `applyHotPins` com o service role e nunca lança.
 * Chamado no fim da rota `frontpage` (é ela que traz sinal novo, a cada 20 min), no fim do `tick`
 * (rede de segurança a cada 30 min, emenda do plano) e depois de cada publicação automática (a
 * matéria do assunto quente pode ter acabado de sair). Idempotente: chamadas repetidas não gravam.
 * Pino novo ou trocado invalida a home; a editoria é lida sem cache de dados.
 */
export async function runHotPins(where: string): Promise<HotPinReport | null> {
  try {
    const report = await applyHotPins({
      repo: createHotPinRepo(createServiceClient()),
      now: () => new Date(),
    });
    if (report.pinned > 0) await revalidateTags(["home"]);
    return report;
  } catch (e) {
    console.error(`pauta quente (${where}):`, e instanceof Error ? e.message : e);
    return null;
  }
}
