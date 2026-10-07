/**
 * Constantes puras do domínio de fontes, sem zod: podem ir ao navegador (telas do Estúdio). Os
 * schemas de validação ficam em `./schema` (só servidor; item 85, A-156).
 */

/** Grade da via rápida (D-F15, D-F28): abaixo de 30 min, uma destas três. */
export const FAST_FREQUENCIES = [10, 15, 20] as const;

/** Grade do ciclo normal: múltiplo de 30 entre 30 e 1440 minutos. */
export const isNormalGridValue = (v: number): boolean => v >= 30 && v <= 1440 && v % 30 === 0;
