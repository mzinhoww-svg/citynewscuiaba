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

export type Device = "desktop" | "tablet" | "mobile";
export const DEVICES: readonly Device[] = ["desktop", "tablet", "mobile"];

export interface SlotFormat {
  width: number;
  height: number;
  /**
   * Aparelhos onde o formato aparece: desktop a partir de `lg` (1024), tablet de `md` (768) a
   * `lg`, celular abaixo de `md`. O tablet tem formato próprio (decisão do dono, 04/10/2026):
   * a faixa larga de 728 cabe no container de 768 sem a coluna lateral.
   */
  devices: readonly Device[];
}

/** Ordem importa: para cada aparelho vale o primeiro formato que tiver peça (CLS 0). */
export const SLOT_FORMATS: Record<DisplaySlot, readonly SlotFormat[]> = {
  TOP: [
    { width: 970, height: 250, devices: ["desktop"] },
    { width: 728, height: 90, devices: ["tablet", "desktop"] },
    { width: 320, height: 100, devices: ["mobile"] },
  ],
  "RAIL-A": [{ width: 300, height: 250, devices: ["desktop"] }],
  "RAIL-B": [{ width: 300, height: 600, devices: ["desktop"] }],
  MID: [
    { width: 970, height: 120, devices: ["desktop"] },
    { width: 728, height: 90, devices: ["tablet"] },
    { width: 320, height: 100, devices: ["mobile"] },
  ],
  "ART-1": [
    { width: 728, height: 90, devices: ["desktop", "tablet"] },
    { width: 320, height: 100, devices: ["mobile"] },
  ],
  "ART-2": [
    { width: 728, height: 250, devices: ["desktop", "tablet"] },
    { width: 300, height: 250, devices: ["mobile"] },
  ],
  STICKY: [{ width: 320, height: 50, devices: ["mobile"] }],
};

/** Peso máximo da peça por campo, em KB (spec banners-padrão, ADS-T3: <= 200 KB). */
export const SLOT_MAX_KB = 200;

export function isDisplaySlot(code: string): code is DisplaySlot {
  return (DISPLAY_SLOTS as readonly string[]).includes(code);
}

export function fitsSlot(slot: DisplaySlot, width: number, height: number): boolean {
  return SLOT_FORMATS[slot].some((f) => f.width === width && f.height === height);
}
