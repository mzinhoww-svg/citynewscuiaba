/**
 * Schemas zod das rotas `/api/push/*` e do pedido de envio de A09 (spec §13, §10.2). Estritos:
 * nada fora do plano entra (sem `anonId`, histórico ou interesse na inscrição).
 */
import { z } from "zod";
import { TARGET_RE } from "./targets";
import { ENDPOINT_MAX } from "./endpoints";

const endpoint = z
  .string({ message: "endpoint inválido" })
  .min(1, "endpoint inválido")
  .max(ENDPOINT_MAX, "endpoint longo demais");
const keys = z.strictObject({
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/, "chave p256dh inválida"),
  auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/, "chave auth inválida"),
});
const targets = z
  .array(z.string().regex(TARGET_RE, "alvo inválido"))
  .max(200, "no máximo 200 alvos");
const quietStart = z.number().int().min(18).max(22);
const quietEnd = z.number().int().min(7).max(10);
const dailyLimit = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const prefsSchema = z.strictObject({
  follow: z.boolean(),
  urgent: z.boolean(),
  highlight: z.boolean(),
  quietStart,
  quietEnd,
  dailyLimit,
});
export type { PushPrefs } from "./types";

export const subscribeBodySchema = z.strictObject({
  endpoint,
  keys,
  targets,
  installed: z.boolean(),
  prefs: prefsSchema.optional(),
  metricsConsent: z.boolean(),
  oldToken: z.string().min(16).max(128).optional(),
});
export type SubscribeBody = z.infer<typeof subscribeBodySchema>;

export const patchBodySchema = z
  .strictObject({
    targets: targets.optional(),
    prefs: prefsSchema.partial().optional(),
    metricsConsent: z.boolean().optional(),
    installed: z.boolean().optional(),
    seen: z.literal(true).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nada para alterar" });
export type PatchBody = z.infer<typeof patchBodySchema>;

export const rotateBodySchema = z.strictObject({ oldEndpoint: endpoint, endpoint, keys });
export type RotateBody = z.infer<typeof rotateBodySchema>;

export const receiptBodySchema = z.strictObject({
  s: z.string().uuid("envio inválido"),
  e: z.enum(["delivered", "clicked"]),
  d: z.enum(["mobile", "tablet", "desktop"]),
  b: z.enum(["chrome", "safari", "firefox", "edge", "samsung", "other"]),
});
export type ReceiptBody = z.infer<typeof receiptBodySchema>;

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/, "slug inválido");
export const audienceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("all") }),
  z.strictObject({ type: z.literal("section"), slug }),
  z.strictObject({ type: z.literal("bairro"), slug }),
]);
export const whenSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("now") }),
  z.strictObject({ type: z.literal("at"), at: z.string().datetime({ offset: true }) }),
]);

export const pushRequestSchema = z
  .strictObject({
    kind: z.enum(["urgent", "highlight"]),
    articleId: z.string().uuid("matéria inválida"),
    title: z.string().trim().min(1, "Informe o título").max(60, "Título com até 60 caracteres"),
    body: z.string().trim().min(1, "Informe o texto").max(120, "Texto com até 120 caracteres"),
    audience: audienceSchema,
    when: whenSchema,
    justification: z.string().trim().max(300, "Justificativa com até 300 caracteres").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "urgent" && !v.justification)
      ctx.addIssue({
        code: "custom",
        path: ["justification"],
        message: "Justificativa obrigatória para urgente",
      });
  });
export type PushRequest = z.infer<typeof pushRequestSchema>;
