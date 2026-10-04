/**
 * Campos padrão de banner (spec `2026-10-03-banners-padrao-design.md` §2, padrão B). Fonte
 * única dos formatos aceitos: a validação da peça (`creative.ts`), a seleção (`select.ts`), o
 * `AdSlot` (altura reservada) e o seed de `ad_slots` (0082) usam esta tabela.
 */

export const SLOT_CODES = [
  "TOP",
  "RAIL-A",
  "RAIL-B",
  "MID",
  "ART-1",
  "ART-2",
  "STICKY",
  "HUB",
] as const;
export type SlotCode = (typeof SLOT_CODES)[number];

/** Campos de imagem (display). `HUB` leva vídeo ou cards de parceiro. */
export const DISPLAY_SLOTS = [
  "TOP",
  "RAIL-A",
  "RAIL-B",
  "MID",
  "ART-1",
  "ART-2",
  "STICKY",
] as const;
export type DisplaySlot = (typeof DISPLAY_SLOTS)[number];

export interface SlotFormat {
  width: number;
  height: number;
  /** Onde o formato aparece: desktop (lg+) ou celular. */
  device: "desktop" | "mobile";
}

export const SLOT_FORMATS: Record<DisplaySlot, readonly SlotFormat[]> = {
  TOP: [
    { width: 970, height: 250, device: "desktop" },
    { width: 728, height: 90, device: "desktop" },
    { width: 320, height: 100, device: "mobile" },
  ],
  "RAIL-A": [{ width: 300, height: 250, device: "desktop" }],
  "RAIL-B": [{ width: 300, height: 600, device: "desktop" }],
  MID: [
    { width: 970, height: 120, device: "desktop" },
    { width: 320, height: 100, device: "mobile" },
  ],
  "ART-1": [
    { width: 728, height: 90, device: "desktop" },
    { width: 320, height: 100, device: "mobile" },
  ],
  "ART-2": [
    { width: 728, height: 250, device: "desktop" },
    { width: 300, height: 250, device: "mobile" },
  ],
  STICKY: [{ width: 320, height: 50, device: "mobile" }],
};

/** Peso máximo da peça por campo, em KB (spec banners-padrão, ADS-T3: <= 200 KB). */
export const SLOT_MAX_KB = 200;

export function isDisplaySlot(code: string): code is DisplaySlot {
  return (DISPLAY_SLOTS as readonly string[]).includes(code);
}

export function fitsSlot(slot: DisplaySlot, width: number, height: number): boolean {
  return SLOT_FORMATS[slot].some((f) => f.width === width && f.height === height);
}
