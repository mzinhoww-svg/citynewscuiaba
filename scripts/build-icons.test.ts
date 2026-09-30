// Ícones do PWA (PW-T4): existem em public/icons com o tamanho declarado e vêm dos tokens.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SPLASH_SIZES } from "./build-icons.mjs";

describe("build-icons", () => {
  it("ícones existem com o tamanho declarado", async () => {
    for (const [f, w] of [
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["maskable-192.png", 192],
      ["maskable-512.png", 512],
      ["apple-touch-icon-180.png", 180],
      ["badge-72.png", 72],
    ] as const) {
      const m = await sharp(`public/icons/${f}`).metadata();
      expect([m.width, m.height], f).toEqual([w, w]);
    }
    for (const [w, h] of SPLASH_SIZES) {
      const m = await sharp(`public/icons/splash-${w}x${h}.png`).metadata();
      expect([m.width, m.height]).toEqual([w, h]);
    }
  });

  it("badge é monocromático com transparência; ícone any tem fundo opaco", async () => {
    const badge = await sharp("public/icons/badge-72.png").stats();
    expect(badge.isOpaque).toBe(false);
    const icon = await sharp("public/icons/icon-192.png").stats();
    expect(icon.isOpaque).toBe(true);
    // Canto do ícone `any` é a cor de fundo (tinta), não transparente.
    const { data } = await sharp("public/icons/icon-192.png").raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(255);
  });

  it("script sem hex cru: cores vêm de tokens.css", () => {
    const src = readFileSync("scripts/build-icons.mjs", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
