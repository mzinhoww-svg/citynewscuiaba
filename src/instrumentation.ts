/**
 * Inicialização do servidor (Next.js): avisa no log da produção quando um segredo está fraco ou
 * derivado do CRON_SECRET (C4-02, C4-03). Não derruba o portal: as rotas de cron já recusam
 * segredo fraco, e a leitura pública não depende desses segredos.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnvWarnings } = await import("@/lib/security/env-check");
  for (const w of serverEnvWarnings()) console.error(`[configuração] ${w}`);
}
