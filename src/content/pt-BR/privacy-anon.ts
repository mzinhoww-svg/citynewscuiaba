/**
 * Perfil anônimo local (spec §5.3). Módulo próprio, pelo mesmo motivo de `privacy-consent.ts`.
 */
export const ANON_TEXT = {
  /** Review Focus 2: IndexedDB indisponível, salvar e seguir valem só nesta visita. */
  degraded: "Não conseguimos salvar neste navegador",
  degradedDetail: "Suas escolhas valem só enquanto esta página estiver aberta.",
  /** Item 88: salvar, seguir ou apagar falhou no armazenamento deste navegador. */
  actFailed: "Não conseguimos guardar essa mudança neste navegador. Tente de novo.",
} as const;
