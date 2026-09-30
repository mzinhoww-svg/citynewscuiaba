import "server-only";
import { z } from "zod";
import { DEFAULT_REC_CONFIG, WEIGHT_KEYS } from "./score";
import type { RecConfig } from "./types";

/*
 * Validação do registro `rec_weights` com zod. Fica fora de `score.ts` para o ranking que roda no
 * navegador (A-055; `rank.ts`, `src/lib/sources/screen.ts`) não levar o zod ao bundle público (B-018).
 */

const weight = z.number().finite().min(0).max(1);
const WeightsSchema = z
  .object({
    popularity: weight,
    individual: weight,
    recency: weight,
    engagement: weight,
    operational: weight,
    diversity: weight,
  })
  .refine((w) => Math.abs(WEIGHT_KEYS.reduce((a, k) => a + w[k], 0) - 1) <= 0.001);

const RowSchema = z.object({
  version: z.string().min(1),
  weights: WeightsSchema,
  cap: z.coerce.number().gt(0).max(1),
  discovery_every: z.number().int().min(2).max(20),
});

/**
 * Registro ativo de `rec_weights` → configuração. Qualquer problema (sem registro, pesos
 * incompletos, soma ≠ 1, teto inválido) cai nos padrões da spec: o ranking nunca para.
 */
export function parseRecConfig(row: unknown): RecConfig {
  const r = RowSchema.safeParse(row);
  if (!r.success) return DEFAULT_REC_CONFIG;
  const { popularity, individual, recency, engagement, operational, diversity } = r.data.weights;
  return {
    version: r.data.version,
    weights: { popularity, individual, recency, engagement, operational, diversity },
    cap: r.data.cap,
    discoveryEvery: r.data.discovery_every,
  };
}
