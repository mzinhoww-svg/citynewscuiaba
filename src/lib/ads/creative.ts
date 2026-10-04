/**
 * Peça de publicidade tipada (MS-T2, docs/media-slots.md §5.1). União discriminada por `kind`:
 * `native` (card de campanha, o formato que `sponsored_campaigns` já guardava), `display`
 * (banner do campo), `tile`, `newsletter` e `video` (só no `HUB`). Resposta patrocinada não
 * existe: é proibida (spec D17, CLAUDE.md §5.5). Link sempre https; imagem sempre com `alt`.
 */
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { DISPLAY_SLOTS, fitsSlot } from "./slots";

const HTTPS = /^https:\/\//i;
const httpsUrl = (what: string) =>
  z.string().trim().url().max(500).regex(HTTPS, `${what} precisa começar com https://`);
const alt = z.string().trim().min(1, "Texto alternativo obrigatório").max(200);

const Common = {
  href: httpsUrl("O link"),
  /** Peso de rotação entre peças do mesmo campo. */
  weight: z.number().int().min(1).max(100).default(1),
  /** Teto de impressões por dia (vazio: sem teto). */
  maxImpressionsPerDay: z.number().int().positive().optional(),
};

const withImageAlt = <T extends { imageUrl?: string; imageAlt?: string; alt?: string }>(
  v: T,
): boolean => !v.imageUrl || Boolean((v.imageAlt ?? v.alt)?.trim());

const Native = z
  .object({
    kind: z.literal("native"),
    title: z.string().trim().min(2).max(120),
    imageUrl: httpsUrl("A imagem").optional(),
    imageAlt: z.string().trim().max(200).optional(),
    ...Common,
  })
  .refine(withImageAlt, { message: "Imagem sem texto alternativo", path: ["imageAlt"] });

const Display = z
  .object({
    kind: z.literal("display"),
    slot: z.enum(DISPLAY_SLOTS),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    imageUrl: httpsUrl("A imagem"),
    alt,
    ...Common,
  })
  .refine((v) => fitsSlot(v.slot, v.width, v.height), {
    message: "Dimensões fora dos formatos do campo",
    path: ["width"],
  });

const Tile = z
  .object({
    kind: z.literal("tile"),
    title: z.string().trim().min(2).max(40),
    iconUrl: httpsUrl("O ícone").optional(),
    alt: z.string().trim().max(200).optional(),
    ...Common,
  })
  .refine((v) => !v.iconUrl || Boolean(v.alt?.trim()), {
    message: "Ícone sem texto alternativo",
    path: ["alt"],
  });

const Newsletter = z
  .object({
    kind: z.literal("newsletter"),
    text: z.string().trim().min(2).max(140),
    imageUrl: httpsUrl("A imagem").optional(),
    alt: z.string().trim().max(200).optional(),
    ...Common,
  })
  .refine(withImageAlt, { message: "Imagem sem texto alternativo", path: ["alt"] });

const Video = z.object({
  kind: z.literal("video"),
  slot: z.literal("HUB"),
  videoUrl: httpsUrl("O vídeo"),
  posterUrl: httpsUrl("O pôster"),
  alt,
  durationSeconds: z.number().int().min(1).max(60),
  ...Common,
});

export const CreativeSchema = z.discriminatedUnion("kind", [
  Native,
  Display,
  Tile,
  Newsletter,
  Video,
]);
export type Creative = z.infer<typeof CreativeSchema>;
export type CreativeKind = Creative["kind"];
export type NativeCreative = Extract<Creative, { kind: "native" }>;
export type DisplayCreative = Extract<Creative, { kind: "display" }>;

/** Valida a peça. Objeto sem `kind` é campanha antiga: vale como `native`. */
export function parseCreative(v: unknown): Result<Creative, string> {
  const input =
    v && typeof v === "object" && !Array.isArray(v) && !("kind" in v)
      ? { ...(v as object), kind: "native" }
      : v;
  const r = CreativeSchema.safeParse(input);
  return r.success ? ok(r.data) : err(r.error.issues.map((i) => i.message).join("; "));
}
