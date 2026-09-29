import { z } from "zod";

/** Chaves de `site_settings` (lista fechada, espelhada no check da migration 0036). */
export const SETTING_KEYS = [
  "seo.title_template",
  "seo.default_description",
  "general.contact_email",
  "general.tip_email",
  "notify.quiet_start",
  "notify.quiet_end",
  "notify.max_push_per_day",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM, como 22:00.");

/** Validação por chave: o valor sempre volta como texto (a coluna é `text`). */
export const SETTING_SCHEMAS: Record<SettingKey, z.ZodType<string>> = {
  "seo.title_template": z
    .string()
    .trim()
    .min(3, "Escreva o modelo do título.")
    .max(120, "Use até 120 caracteres.")
    .refine((v) => v.includes("{titulo}"), "O modelo precisa conter {titulo}."),
  "seo.default_description": z
    .string()
    .trim()
    .min(20, "Escreva pelo menos 20 caracteres.")
    .max(300, "Use até 300 caracteres."),
  "general.contact_email": z.string().trim().email("Informe um e-mail válido.").max(200),
  "general.tip_email": z.string().trim().email("Informe um e-mail válido.").max(200),
  "notify.quiet_start": hhmm,
  "notify.quiet_end": hhmm,
  "notify.max_push_per_day": z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Informe um número inteiro.")
    .refine((v) => Number(v) >= 1 && Number(v) <= 10, "Use de 1 a 10 por dia."),
};

export const isSettingKey = (k: string): k is SettingKey =>
  (SETTING_KEYS as readonly string[]).includes(k);

export type SettingsValidation =
  | { ok: true; values: Partial<Record<SettingKey, string>> }
  | { ok: false; errors: Partial<Record<SettingKey, string>> };

/** Valida só as chaves presentes em `input`; devolve os valores aparados ou o erro de cada chave. */
export function validateSettings(
  input: Partial<Record<string, string>>,
  allowed: readonly SettingKey[] = SETTING_KEYS,
): SettingsValidation {
  const values: Partial<Record<SettingKey, string>> = {};
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const key of allowed) {
    const raw = input[key];
    if (raw === undefined) continue;
    const r = SETTING_SCHEMAS[key].safeParse(raw);
    if (r.success) values[key] = r.data;
    else errors[key] = r.error.issues[0]?.message ?? "Valor inválido.";
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

/** Modelo de título aplicado a um título: `{titulo}` vira o texto. */
export const applyTitleTemplate = (template: string, title: string): string =>
  template.replace("{titulo}", title);

/* ------------------------------------------------------------------ campanhas */

export const campaignInputSchema = z
  .object({
    advertiser: z.string().trim().min(2, "Informe o anunciante.").max(120),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início."),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de fim."),
    sections: z
      .array(z.string().regex(/^[a-z0-9-]{2,40}$/))
      .min(1, "Escolha pelo menos uma editoria.")
      .refine((s) => !s.includes("politica"), "Patrocinado nunca aparece em Política."),
    headline: z.string().trim().min(3, "Escreva o título da peça.").max(120),
    url: z
      .string()
      .trim()
      .url("Informe o link do anunciante.")
      .refine((u) => u.startsWith("https://"), "O link precisa começar com https://."),
  })
  .refine((c) => c.endsOn >= c.startsOn, {
    message: "O fim não pode ser antes do início.",
    path: ["endsOn"],
  });
export type CampaignInput = z.infer<typeof campaignInputSchema>;
