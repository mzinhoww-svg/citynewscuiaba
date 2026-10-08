import { describe, expect, it } from "vitest";
import { nativeClickHref, withNativeSponsored, type FeedArticle } from "./native";
import { SLOT_EVERY, type Campaign } from "./rules";

const now = new Date("2026-10-08T12:00:00Z");
const camp: Campaign = {
  id: "11111111-2222-4333-8444-555555555555",
  advertiser: "Padaria do Porto",
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  allowedSections: ["cidade", "cultura"],
  status: "active",
  creative: {
    kind: "native",
    title: "Pão quente às 6h",
    href: "https://padaria.example",
    imageUrl: "https://img.example/pao.png",
    imageAlt: "Pães na vitrine",
  },
};
const art = (i: number, over: Partial<FeedArticle> = {}): FeedArticle => ({
  id: `a${i}`,
  section: { slug: "cidade" },
  urgent: false,
  sponsored: false,
  ...over,
});
const list = (n: number, over?: (i: number) => Partial<FeedArticle>) =>
  Array.from({ length: n }, (_, i) => art(i, over?.(i) ?? {}));
const base = { now, sectionSlug: "cidade" as string | null, maxPerPage: 3 };
const kinds = (r: ReturnType<typeof withNativeSponsored>) =>
  r.map((x) => (x.kind === "article" ? x.article.id : "AD"));

describe("withNativeSponsored (B-022)", () => {
  it("interruptor desligado: a lista sai idêntica, sem patrocinado", () => {
    const cards = list(14);
    const r = withNativeSponsored(cards, { ...base, enabled: false, campaign: camp });
    expect(r).toEqual(cards.map((article) => ({ kind: "article", article })));
  });

  it("sem campanha válida: lista idêntica", () => {
    const cards = list(14);
    const r = withNativeSponsored(cards, { ...base, enabled: true, campaign: null });
    expect(r).toEqual(cards.map((article) => ({ kind: "article", article })));
  });

  it("ligado: no máximo 1 a cada 6 itens, nunca na manchete, sem perder matéria", () => {
    const cards = list(14);
    const r = withNativeSponsored(cards, { ...base, enabled: true, campaign: camp });
    expect(kinds(r).filter((k) => k !== "AD")).toEqual(cards.map((c) => c.id));
    expect(r[0]?.kind).toBe("article");
    const ads = r.flatMap((x, i) => (x.kind === "sponsored" ? [i] : []));
    expect(ads.length).toBeGreaterThan(0);
    // Em qualquer janela de 6 itens consecutivos há no máximo 1 patrocinado.
    for (let i = 0; i + SLOT_EVERY <= r.length; i++) {
      const window = r.slice(i, i + SLOT_EVERY);
      expect(window.filter((x) => x.kind === "sponsored").length).toBeLessThanOrEqual(1);
    }
    for (let k = 1; k < ads.length; k++) expect(ads[k]! - ads[k - 1]!).toBeGreaterThan(SLOT_EVERY);
    expect(ads[0]).toBeGreaterThanOrEqual(SLOT_EVERY);
  });

  it("respeita o teto por página (padrão 1)", () => {
    const r = withNativeSponsored(list(30), {
      enabled: true,
      campaign: camp,
      now,
      sectionSlug: "cidade",
    });
    expect(r.filter((x) => x.kind === "sponsored")).toHaveLength(1);
  });

  it("o card leva o rótulo Patrocinado, o anunciante e o link pela rota de clique", () => {
    const r = withNativeSponsored(list(14), { ...base, enabled: true, campaign: camp });
    const ad = r.find((x) => x.kind === "sponsored");
    expect(ad?.kind === "sponsored" && ad.ad).toEqual({
      campaignId: camp.id,
      advertiser: "Padaria do Porto",
      label: "Patrocinado",
      title: "Pão quente às 6h",
      href: `/api/ads/click/${camp.id}?s=cidade`,
      imageUrl: "https://img.example/pao.png",
      imageAlt: "Pães na vitrine",
      sectionSlug: "cidade",
    });
  });

  it("nunca em Política (nem subeditoria) nem nas outras editorias proibidas", () => {
    const wide = { ...camp, allowedSections: ["politica", "politica-municipal", "saude"] };
    for (const s of ["politica", "politica-municipal", "seguranca", "saude", "justica"]) {
      const r = withNativeSponsored(
        list(14, () => ({ section: { slug: s } })),
        {
          ...base,
          sectionSlug: s,
          enabled: true,
          campaign: wide,
        },
      );
      expect(r.some((x) => x.kind === "sponsored")).toBe(false);
    }
    const categoryOf = (slug: string) => (slug === "camara" ? "politica" : undefined);
    const r = withNativeSponsored(
      list(14, () => ({ section: { slug: "camara" } })),
      {
        ...base,
        sectionSlug: "camara",
        categoryOf,
        enabled: true,
        campaign: { ...camp, allowedSections: ["camara"] },
      },
    );
    expect(r.some((x) => x.kind === "sponsored")).toBe(false);
  });

  it("nunca em lista de respostas do Pergunte", () => {
    const r = withNativeSponsored(list(14), {
      ...base,
      enabled: true,
      campaign: camp,
      aiAnswer: true,
    });
    expect(r.some((x) => x.kind === "sponsored")).toBe(false);
  });

  it("nunca ao lado de matéria urgente ou sensível", () => {
    const r = withNativeSponsored(
      list(12, (i) => (i >= 5 ? { urgent: i % 2 === 1, nationalCommotion: i % 2 === 0 } : {})),
      { ...base, enabled: true, campaign: camp },
    );
    expect(r.some((x) => x.kind === "sponsored")).toBe(false);
  });

  it("editoria fora da campanha não recebe", () => {
    const r = withNativeSponsored(
      list(14, () => ({ section: { slug: "esportes" } })),
      {
        ...base,
        sectionSlug: "esportes",
        enabled: true,
        campaign: camp,
      },
    );
    expect(r.some((x) => x.kind === "sponsored")).toBe(false);
  });

  it("link de clique: só a editoria vai na URL, e só quando há editoria", () => {
    expect(nativeClickHref(camp.id, null)).toBe(`/api/ads/click/${camp.id}`);
    expect(nativeClickHref(camp.id, "cultura")).toBe(`/api/ads/click/${camp.id}?s=cultura`);
  });
});
