/**
 * Projetos do Playwright que mudam estado global (item 91, T-18). Flags, regras ativas,
 * pesos, prompts em produção, configurações, papéis do seed, notificações do admin e as posições
 * de destaque (manchete da home) são do banco inteiro: um spec que as muda faz outro, rodando ao
 * mesmo tempo, ler um estado que não é o dele. Esses specs saem dos projetos paralelos
 * (`desktop`, `mobile`, `mobile-webkit`) e rodam em `serial-flags*`, um worker por vez, depois
 * que os paralelos terminam (localmente, pelas `dependencies`; no CI, em jobs próprios, cada um
 * com o seu banco).
 *
 * Dentro deles, só `serial-flags` (desktop) muda dado; `serial-flags-mobile` e
 * `serial-flags-webkit` conferem o que não muda (leitura, tela, axe), como antes faziam o
 * `mobile` e o `mobile-webkit`.
 */
import type { TestInfo } from "@playwright/test";

export const SERIAL_PROJECT = "serial-flags";
export const SERIAL_MOBILE_PROJECT = "serial-flags-mobile";
export const SERIAL_WEBKIT_PROJECT = "serial-flags-webkit";

export const SERIAL_SPECS = [
  // Regras de publicação: muda a versão ativa.
  "**/e2e/control-rules.spec.ts",
  // Contingência: ai_enabled, read_only e outras flags.
  "**/e2e/admin-contingency.spec.ts",
  // Manchete e destaques da home (posições globais; pauta quente liga hot_featured_enabled).
  "**/e2e/featured-public.spec.ts",
  "**/e2e/featured-hot.spec.ts",
  "**/e2e/admin-featured.spec.ts",
  "**/a11y/admin-featured.spec.ts",
  // Sino do Estúdio: conta as não lidas do admin, que os outros specs também criam.
  "**/e2e/studio-notifications.spec.ts",
  // Modo do revisor automático (linha única).
  "**/e2e/reviewer-mode.spec.ts",
  // Prompt em produção e pesos ativos da recomendação.
  "**/e2e/control-prompts.spec.ts",
  "**/e2e/control-rec.spec.ts",
  // Configurações globais (app_settings) e papéis do seed.
  "**/e2e/admin-ops.spec.ts",
  "**/e2e/a09-new-settings.spec.ts",
  "**/e2e/admin-core.spec.ts",
  // Veiculação de anúncios.
  "**/e2e/ads-admin.spec.ts",
];

/** Só o projeto serial do desktop muda estado global; os outros conferem leitura. */
export function mutatesGlobalState(info: Pick<TestInfo, "project">): boolean {
  return info.project.name === SERIAL_PROJECT;
}
