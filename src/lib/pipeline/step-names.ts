/*
 * Nomes das etapas do ciclo, sem zod: o Control Center (navegador) importa daqui; os schemas
 * das mensagens ficam em `./types` (item 85, A-156).
 */

/** As 20 etapas do ciclo de 30 minutos, na ordem da spec §6.2. */
export const STEP_NAMES = [
  "tick", // 1 cron
  "fetch", // 2 buscar
  "validate", // 3 validar
  "extract", // 4 extrair
  "normalize", // 5 normalizar
  "dedupe", // 6 deduplicar
  "cluster", // 7 agrupar
  "classify", // 8 classificar
  "locate", // 9 localidade
  "verify", // 10 verificar fontes
  "summarize", // 11 resumir
  "headline", // 12 título e linha fina
  "image", // 13 imagem
  "image_rights", // 14 direitos da imagem
  "rules", // 15 regras
  "route", // 16 rota (auto ou revisão)
  "publish", // 17 publicar ou exceção
  "record", // 18 registrar
  "index", // 19 indexar
  "notify", // 20 notificar
] as const;

export type StepName = (typeof STEP_NAMES)[number];
