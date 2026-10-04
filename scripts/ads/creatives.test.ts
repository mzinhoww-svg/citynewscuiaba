import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DISPLAY_SLOTS, SLOT_FORMATS } from "@/lib/ads/slots";
import { parseCreative } from "@/lib/ads/creative";
import { HOUSE_MESSAGES, HOUSE_SIZES, MAX_KB, altOf, fileName } from "./creatives.mjs";

describe("peças da casa (ADS-T3)", () => {
  it("cobrem todos os formatos de todos os campos de imagem", () => {
    for (const slot of DISPLAY_SLOTS)
      for (const f of SLOT_FORMATS[slot])
        expect(
          HOUSE_SIZES.some((s) => s.width === f.width && s.height === f.height && s.slots.includes(slot)),
          `${slot} ${f.width}x${f.height}`,
        ).toBe(true);
  });

  it("6 mensagens dos produtos do CityNews, links internos e texto sem a sigla IA", () => {
    expect(HOUSE_MESSAGES.map((m) => m.id)).toEqual([
      "newsletter",
      "alertas",
      "agenda",
      "guia",
      "anuncie",
      "evento",
    ]);
    for (const m of HOUSE_MESSAGES) {
      expect(m.href).toMatch(/^\/[a-z]/);
      expect(`${m.title} ${m.text} ${m.cta}`).not.toMatch(/\bIA\b|inteligência artificial/i);
      expect(m.title.length).toBeLessThanOrEqual(28);
    }
  });

  it("cada PNG existe, pesa até 200 KB e vira peça válida com alt", () => {
    for (const m of HOUSE_MESSAGES)
      for (const s of HOUSE_SIZES) {
        const file = join("public/ads", fileName(m.id, s.width, s.height));
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size / 1024, file).toBeLessThanOrEqual(MAX_KB);
        for (const slot of s.slots) {
          const r = parseCreative({
            kind: "display",
            slot,
            width: s.width,
            height: s.height,
            imageUrl: `https://citynews.example/ads/${fileName(m.id, s.width, s.height)}`,
            alt: altOf(m),
            href: `https://citynews.example${m.href}`,
          });
          expect(r.ok, `${file} ${slot}`).toBe(true);
        }
      }
  });
});

describe("cadastro das peças da casa (ADS-T3)", () => {
  it("78 veiculações válidas, sem editoria, com links e imagens do próprio site", async () => {
    const { houseAdRows, houseAdsSql } = await import("./creatives.mjs");
    const rows = houseAdRows("https://citynewscuiaba.vercel.app/");
    expect(rows).toHaveLength(78);
    expect(new Set(rows.map((r) => r.name)).size).toBe(78);
    for (const r of rows) {
      expect(parseCreative(r.creative).ok, r.name).toBe(true);
      expect(r.creative.href.startsWith("https://citynewscuiaba.vercel.app/")).toBe(true);
    }
    const sql = houseAdsSql("https://citynewscuiaba.vercel.app", "2026-10-04");
    expect(sql).toContain("where not exists");
    expect(sql.match(/Casa · /g)).toHaveLength(78);
    expect(() => houseAdRows("http://inseguro.example")).toThrow();
  });
});
