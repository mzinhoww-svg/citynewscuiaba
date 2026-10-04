import { err, ok, type Result } from "@/lib/result";
import type { Slot, SlotKey } from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Data final: no máximo 14 dias à frente. Sem prazo, o pino fica até o admin remover (R28). */
export const MAX_PIN_DAYS = 14;

/** Botões de prazo do admin; `until_removed` = sem fim marcado. */
export const PIN_DURATIONS = ["1h", "3h", "6h", "12h", "24h", "3d", "until_removed"] as const;
export type PinDuration = (typeof PIN_DURATIONS)[number] | { until: Date };

const PRESET_HOURS: Record<Exclude<(typeof PIN_DURATIONS)[number], "until_removed">, number> = {
  "1h": 1,
  "3h": 3,
  "6h": 6,
  "12h": 12,
  "24h": 24,
  "3d": 72,
};

/** Data final do pino a partir do botão escolhido; `null` = até remover. */
export function pinEndsAt(duration: PinDuration, now: Date): Date | null {
  if (typeof duration === "object") return duration.until;
  if (duration === "until_removed") return null;
  return new Date(now.getTime() + PRESET_HOURS[duration] * HOUR_MS);
}

export interface PinCheck {
  /** `undefined` = posição que não existe na tabela. */
  slot: Slot | undefined;
  sectionSlug: string | null;
  article: { status: string; sponsored: boolean; hasCover: boolean };
  endsAt: Date | null;
  /** Pinos ativos hoje nessa posição (e nessa editoria, em `editoria.lead`). */
  activeInSlot: number;
  now: Date;
}

export interface PinInput {
  slotKey: SlotKey;
  sectionSlug: string | null;
  endsAt: Date | null;
}

export type PinError = "duration" | "ineligible" | "capacity" | "slot" | "no_cover";

/** Confere posição, prazo, matéria (publicada, não patrocinada, com capa, R39) e vaga. */
export function validatePin(c: PinCheck): Result<PinInput, PinError> {
  if (!c.slot) return err("slot");
  const perSection = c.slot.page === "editoria";
  if (perSection !== (c.sectionSlug !== null)) return err("slot");
  if (c.endsAt) {
    const t = c.endsAt.getTime();
    if (t <= c.now.getTime() || t > c.now.getTime() + MAX_PIN_DAYS * DAY_MS) return err("duration");
  }
  if (!["published", "updated"].includes(c.article.status) || c.article.sponsored)
    return err("ineligible");
  if (!c.article.hasCover) return err("no_cover");
  if (c.activeInSlot >= c.slot.capacity) return err("capacity");
  return ok({ slotKey: c.slot.key, sectionSlug: c.sectionSlug, endsAt: c.endsAt });
}
