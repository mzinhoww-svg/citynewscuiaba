import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

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

/**
 * Jobs de push (spec 2026-09-28 §12; G3/A-072): três passos fora das 20 etapas, na fila
 * `notify`, com `runId: "push"`. `push_match` (`article:<id>` ou `push:<sendId>`) faz o fan-out
 * em lotes; `push_deliver` (`push:<sendId>:<lote>`) entrega um lote; `push_due` (`due:<sendId>`)
 * entrega adiados e retentativas.
 */
export const PUSH_STEPS = ["push_match", "push_deliver", "push_due"] as const;
export type PushStep = (typeof PUSH_STEPS)[number];
/**
 * `enrich` (fora das 20 etapas): enriquecimento opcional por página (og:title, og:image, data,
 * lead) entre `normalize` e `dedupe`, ligado por fonte (`consumption.enrich === true`). Fonte sem
 * a flag nunca recebe esta mensagem.
 */
export const ENRICH_STEP = "enrich" as const;
/**
 * `forced_publish` (fora das 20 etapas, REV-T1): um lote de até 50 matérias do "Publicar mesmo
 * assim" da fila de revisão (`forced:<job>:<lote>`), com `runId: "forced"`. Lido antes das demais.
 */
export const FORCED_PUBLISH_STEP = "forced_publish" as const;
export const FORCED_PUBLISH_RUN_ID = "forced";
export const JOB_STEPS = [...STEP_NAMES, ENRICH_STEP, ...PUSH_STEPS, FORCED_PUBLISH_STEP] as const;
export type JobStep = (typeof JOB_STEPS)[number];
export const PUSH_RUN_ID = "push";

/** Etapas da fase de Coleta: o próximo ciclo não começa enquanto houver alguma pendente. */
export const COLLECTION_STEPS: readonly JobStep[] = [
  "fetch",
  "validate",
  "extract",
  "normalize",
  "enrich",
];

export const QUEUE_NAMES = ["pipeline", "media", "notify"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const PipelineMessageSchema = z.object({
  runId: z.string().min(1).max(64),
  step: z.enum(JOB_STEPS),
  itemRef: z.string().min(1).max(400),
  attempt: z.number().int().min(1),
});

export type PipelineMessage = z.infer<typeof PipelineMessageSchema>;

export function parsePipelineMessage(value: unknown): Result<PipelineMessage, string> {
  const r = PipelineMessageSchema.safeParse(value);
  return r.success ? ok(r.data) : err(r.error.issues.map((i) => i.message).join("; "));
}

/** Idempotência por `(item, etapa)` (spec §6.2): a mesma etapa do mesmo item fica uma vez só na fila. */
export function dedupeKey(msg: PipelineMessage): string {
  return `${msg.step}:${msg.itemRef}`;
}

/** Item bruto de um feed, já com texto sanitizado (spec §6.6) e data em ISO UTC. */
export const RawEntrySchema = z.object({
  title: z.string().min(1),
  /** URL absoluta como veio do feed; `normalize` canonicaliza. */
  url: z.string().min(1),
  publishedAt: z.string().nullable(),
  excerpt: z.string().nullable(),
  author: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Instrução embutida em algum campo: o item vai para a quarentena em `normalize`. */
  injection: z.boolean(),
  injectionMatches: z.array(z.string()),
  /** `title_slug`: título derivado do slug da URL (sitemap sem `news:title`); ausente = do site. */
  titleSource: z.literal("title_slug").optional(),
});

export type RawEntry = z.infer<typeof RawEntrySchema>;

/**
 * Fila de cada etapa (ADR-004): imagem e direitos em `media`, notificação em `notify`, o resto em
 * `pipeline`. O drain enfileira a próxima etapa na fila dela.
 */
export function queueFor(step: JobStep): QueueName {
  if (step === "image" || step === "image_rights") return "media";
  if (step === "notify" || (PUSH_STEPS as readonly string[]).includes(step)) return "notify";
  return "pipeline";
}
