import { describe, expect, it } from "vitest";
import {
  campaignEligible,
  campaignStatus,
  placeSponsored,
  politicalSlugs,
  SPONSORED_LABEL,
  SPONSORED_MIN_GAP,
  type Card,
  type SponsoredCampaign,
} from "./rules";

const card = (n: number, extra: Partial<Card> = {}): Card => ({
  id: `c${n}`,
  section: "cidade",
  ...extra,
});
const feed = (n: number, extra: Partial<Card> = {}) =>
  Array.from({ length: n }, (_, i) => card(i, extra));

const campaign: SponsoredCampaign = {
  id: "camp-1",
  advertiser: "Anunciante Fictício",
  startsOn: "2026-09-01",
  endsOn: "2026-12-31",
  allowedSections: ["cidade", "economia"],
  active: true,
  creative: { headline: "Peça de teste", url: "https://anunciante.example/oferta" },
};
const TODAY = "2026-09-29";
const sponsoredOf = (cards: Card[]) => cards.filter((c) => c.kind === "sponsored");

describe("placeSponsored", () => {
  it("coloca no máximo um patrocinado e nunca antes de 5 cards (1 a cada 6)", () => {
    const out = placeSponsored(feed(12), campaign, TODAY);
    expect(sponsoredOf(out)).toHaveLength(1);
    expect(out.findIndex((c) => c.kind === "sponsored")).toBe(SPONSORED_MIN_GAP);
    expect(out).toHaveLength(13);
  });

  it("lista curta (menos de 5 cards) fica intacta", () => {
    const cards = feed(SPONSORED_MIN_GAP - 1);
    expect(placeSponsored(cards, campaign, TODAY)).toEqual(cards);
  });

  it("o card patrocinado sempre traz o rótulo PATROCINADO e o link", () => {
    const [s] = sponsoredOf(placeSponsored(feed(8), campaign, TODAY));
    expect(s?.label).toBe(SPONSORED_LABEL);
    expect(SPONSORED_LABEL).toBe("PATROCINADO");
    expect(s?.href).toBe("https://anunciante.example/oferta");
    expect(s?.section).toBe("cidade");
  });

  it("nunca em Política, mesmo que a campanha liste a editoria", () => {
    const cards = feed(10, { section: "politica" });
    expect(
      placeSponsored(cards, { ...campaign, allowedSections: ["politica", "cidade"] }, TODAY),
    ).toEqual(cards);
  });

  it("não entra em lista de editoria fora das permitidas", () => {
    const cards = feed(10, { section: "esportes" });
    expect(placeSponsored(cards, campaign, TODAY)).toEqual(cards);
  });

  it("nunca ao lado de urgente, manchete ou resposta de IA: procura o próximo intervalo livre", () => {
    const cards = feed(12);
    cards[4] = card(4, { urgent: true });
    const out = placeSponsored(cards, campaign, TODAY);
    const at = out.findIndex((c) => c.kind === "sponsored");
    expect(at).toBeGreaterThan(SPONSORED_MIN_GAP);
    for (const n of [out[at - 1], out[at + 1]]) {
      expect(n?.urgent).not.toBe(true);
      expect(n?.headline).not.toBe(true);
    }
  });

  it("sem intervalo livre, não coloca nada", () => {
    const cards = feed(8, { headline: true });
    expect(placeSponsored(cards, campaign, TODAY)).toEqual(cards);
  });

  it("superfície de resposta de IA nunca recebe patrocinado", () => {
    const cards = [...feed(8), card(99, { kind: "ai_answer" })];
    expect(placeSponsored(cards, campaign, TODAY)).toEqual(cards);
  });

  it("card urgente, manchete ou de IA na lista não recebe rótulo nem é removido", () => {
    const cards = feed(9);
    cards[0] = card(0, { headline: true });
    const out = placeSponsored(cards, campaign, TODAY);
    expect(out[0]).toEqual(cards[0]);
    expect(out.filter((c) => c.kind !== "sponsored")).toEqual(cards);
  });

  it("campanha inativa, fora do período ou sem editoria não entra", () => {
    const cards = feed(10);
    expect(placeSponsored(cards, { ...campaign, active: false }, TODAY)).toEqual(cards);
    expect(placeSponsored(cards, campaign, "2027-01-01")).toEqual(cards);
    expect(placeSponsored(cards, campaign, "2026-08-31")).toEqual(cards);
    expect(placeSponsored(cards, { ...campaign, allowedSections: [] }, TODAY)).toEqual(cards);
  });

  it("não muda a lista original", () => {
    const cards = feed(10);
    const copy = structuredClone(cards);
    placeSponsored(cards, campaign, TODAY);
    expect(cards).toEqual(copy);
  });
});

describe("campaignEligible", () => {
  it("período é inclusivo nas duas pontas e exige `active`", () => {
    expect(campaignEligible(campaign, "2026-09-01")).toBe(true);
    expect(campaignEligible(campaign, "2026-12-31")).toBe(true);
    expect(campaignEligible({ ...campaign, active: false }, TODAY)).toBe(false);
  });
  it("política nunca é permitida", () => {
    expect(campaignEligible({ ...campaign, allowedSections: ["politica"] }, TODAY)).toBe(false);
  });
});

describe("campaignStatus", () => {
  it("encerrada, agendada, ativa e pausada", () => {
    expect(campaignStatus(campaign, "2027-01-01")).toBe("expired");
    expect(campaignStatus(campaign, "2026-08-01")).toBe("scheduled");
    expect(campaignStatus(campaign, TODAY)).toBe("active");
    expect(campaignStatus({ ...campaign, active: false }, TODAY)).toBe("paused");
  });
});

describe("Política em subeditorias e categorias (gate P5, M2-R3)", () => {
  const sections = [
    { slug: "politica", parentSlug: null, autonomyCategory: "politica" },
    { slug: "eleicoes", parentSlug: "politica", autonomyCategory: "cidade" },
    { slug: "eleicoes-mt", parentSlug: "eleicoes", autonomyCategory: "cidade" },
    { slug: "camara", parentSlug: null, autonomyCategory: "politica" },
    { slug: "cidade", parentSlug: null, autonomyCategory: "cidade" },
    { slug: "mobilidade", parentSlug: "cidade", autonomyCategory: "cidade" },
  ];
  const political = politicalSlugs(sections);

  it("trata como Política o slug, a categoria de autonomia e os descendentes em qualquer nível", () => {
    expect([...political].sort()).toEqual(["camara", "eleicoes", "eleicoes-mt", "politica"]);
    expect(political.has("mobilidade")).toBe(false);
  });

  it("campanha só com editorias políticas não é elegível", () => {
    expect(
      campaignEligible({ ...campaign, allowedSections: ["eleicoes", "camara"] }, TODAY, political),
    ).toBe(false);
    expect(
      campaignEligible({ ...campaign, allowedSections: ["eleicoes", "cidade"] }, TODAY, political),
    ).toBe(true);
  });

  it("nunca entra ao lado de card de subeditoria de Política nem de categoria política", () => {
    const camp = { ...campaign, allowedSections: ["cidade", "eleicoes"] };
    const sub = feed(12, { section: "cidade" });
    sub[5] = card(5, { section: "eleicoes", parentSlug: "politica" });
    expect(sponsoredOf(placeSponsored(sub, camp, TODAY, political))).toHaveLength(1);
    const out = placeSponsored(sub, camp, TODAY, political);
    const at = out.findIndex((c) => c.kind === "sponsored");
    expect(out[at - 1]?.section).not.toBe("eleicoes");
    expect(out[at + 1]?.section).not.toBe("eleicoes");
    const cat = feed(12, { section: "cidade", category: "politica" });
    expect(placeSponsored(cat, camp, TODAY, political)).toEqual(cat);
    const byParent = feed(12, { section: "cidade", parentSlug: "politica" });
    expect(placeSponsored(byParent, camp, TODAY)).toEqual(byParent);
  });
});
