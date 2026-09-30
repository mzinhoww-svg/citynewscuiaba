import { describe, expect, it } from "vitest";
import { campaignLive, isNeverSection, placeSponsored, type AdCard, type Campaign } from "./rules";

const now = new Date("2026-09-29T12:00:00Z");
const camp: Campaign = {
  id: "c1",
  advertiser: "Padaria do Porto",
  startsOn: "2026-09-01",
  endsOn: "2026-10-31",
  allowedSections: ["cidade", "cultura", "servicos"],
  status: "active",
  creative: { title: "Pão quente às 6h", href: "https://padaria.example" },
};
const card = (i: number, extra: Partial<AdCard> = {}): AdCard => ({
  id: `a${i}`,
  sectionSlug: "cidade",
  ...extra,
});
const list = (n: number, extra?: (i: number) => Partial<AdCard>) =>
  Array.from({ length: n }, (_, i) => card(i, extra?.(i) ?? {}));
const ids = (r: ReturnType<typeof placeSponsored>) => r.items.map((x) => x.card?.id ?? "AD");

describe("placeSponsored (A07)", () => {
  it("no máximo 1 a cada 6, nunca na manchete, com rótulo PATROCINADO e fora da contagem editorial", () => {
    const r = placeSponsored(list(14), camp, { sectionSlug: null, now, maxPerPage: 3 });
    expect(ids(r)).toEqual([
      "a0",
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "AD",
      "a6",
      "a7",
      "a8",
      "a9",
      "a10",
      "a11",
      "AD",
      "a12",
      "a13",
    ]);
    expect(r.placed).toBe(2);
    expect(r.editorialCount).toBe(14);
    expect(r.items[6]!.sponsored).toMatchObject({
      label: "PATROCINADO",
      advertiser: "Padaria do Porto",
    });
    expect(placeSponsored(list(14), camp, { sectionSlug: null, now }).placed).toBe(1);
  });

  it("nunca em Política, Segurança ou Saúde nem em respostas da IA", () => {
    for (const s of ["politica", "seguranca", "saude"])
      expect(placeSponsored(list(14), camp, { sectionSlug: s, now }).placed).toBe(0);
    expect(
      placeSponsored(
        list(14, () => ({ aiAnswer: true })),
        camp,
        { sectionSlug: null, now },
      ).placed,
    ).toBe(0);
    expect(placeSponsored(list(14), camp, { sectionSlug: "economia", now }).placed).toBe(0);
  });

  it("pula o lugar ao lado de urgente ou de contexto sensível e segue adiante", () => {
    const r = placeSponsored(
      list(14, (i) => (i === 5 || i === 6 ? { urgent: true } : {})),
      camp,
      { sectionSlug: "cidade", now },
    );
    expect(ids(r).indexOf("AD")).toBe(8);
    const s = placeSponsored(
      list(14, (i) => (i >= 5 ? { sensitive: true } : {})),
      camp,
      { sectionSlug: "cidade", now },
    );
    expect(s.placed).toBe(0);
  });

  it("campanha fora do período, pausada ou ausente não coloca nada", () => {
    expect(
      placeSponsored(list(14), { ...camp, status: "paused" }, { sectionSlug: null, now }).placed,
    ).toBe(0);
    expect(
      placeSponsored(list(14), { ...camp, endsOn: "2026-09-28" }, { sectionSlug: null, now })
        .placed,
    ).toBe(0);
    expect(placeSponsored(list(14), null, { sectionSlug: null, now }).placed).toBe(0);
    expect(campaignLive(camp, now)).toBe(true);
    expect(campaignLive({ ...camp, startsOn: "2026-10-01" }, now)).toBe(false);
  });

  it("subeditoria herda a proibição pela categoria de autonomia e pelo prefixo (gate P5, achado 13)", () => {
    const categoryOf = (slug: string) =>
      ({
        "politica-municipal": "politica",
        "delegacia-digital": "seguranca",
        mobilidade: "cidade",
      })[slug];
    expect(isNeverSection("politica-municipal")).toBe(true); // só pelo prefixo
    expect(isNeverSection("delegacia-digital", categoryOf)).toBe(true); // só pela categoria
    expect(isNeverSection("mobilidade", categoryOf)).toBe(false);
    expect(isNeverSection("saude")).toBe(true);
    expect(isNeverSection("saudavel-e-bem")).toBe(false);
    const wide: Campaign = {
      ...camp,
      allowedSections: ["politica-municipal", "delegacia-digital", "cidade"],
    };
    for (const s of ["politica-municipal", "delegacia-digital"])
      expect(placeSponsored(list(14), wide, { sectionSlug: s, now, categoryOf }).placed).toBe(0);
    // Na home, card de subeditoria proibida nunca fica ao lado do anúncio.
    const cards = list(14, (i) => (i >= 4 && i <= 7 ? { sectionSlug: "delegacia-digital" } : {}));
    const r = placeSponsored(cards, wide, { sectionSlug: null, now, categoryOf });
    expect(ids(r).indexOf("AD")).toBeGreaterThan(7);
  });
});
