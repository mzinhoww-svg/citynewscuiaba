import { describe, expect, it } from "vitest";
import type { DisplayCreative } from "./creative";
import { eligibleCandidates, pickCandidate, type AdPlacement } from "./select";

const now = new Date("2026-10-04T15:00:00Z");
const creative = (w = 970, h = 250, slot: DisplayCreative["slot"] = "TOP"): DisplayCreative => ({
  kind: "display",
  slot,
  width: w,
  height: h,
  imageUrl: "https://img.example/a.png",
  alt: "Pães",
  href: "https://padaria.example",
  weight: 1,
});
const place = (id: string, over: Partial<AdPlacement> = {}): AdPlacement => ({
  id,
  slot: "TOP",
  creative: creative(),
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  allowedSections: [],
  weight: 1,
  maxImpressionsPerDay: null,
  impressionsToday: 0,
  isHouse: false,
  ...over,
});
const ctx = { slot: "TOP" as const, sectionSlug: "cidade", now };

describe("eligibleCandidates (ADS-T1)", () => {
  it("respeita campo, período e teto diário", () => {
    const list = [
      place("ok"),
      place("outro-campo", { slot: "MID" }),
      place("acabou", { endsOn: "2026-10-03" }),
      place("nao-comecou", { startsOn: "2026-10-05" }),
      place("teto", { maxImpressionsPerDay: 100, impressionsToday: 100 }),
    ];
    expect(eligibleCandidates(list, ctx).map((c) => c.id)).toEqual(["ok"]);
  });

  it("editoria proibida, urgente ou subeditoria proibida: nenhuma peça, nem a da casa", () => {
    const list = [place("pago"), place("casa", { isHouse: true })];
    expect(eligibleCandidates(list, { ...ctx, sectionSlug: "politica" })).toEqual([]);
    expect(eligibleCandidates(list, { ...ctx, sectionSlug: "justica" })).toEqual([]);
    expect(eligibleCandidates(list, { ...ctx, urgent: true })).toEqual([]);
    const categoryOf = (s: string) => ({ "delegacia-digital": "seguranca" })[s];
    expect(
      eligibleCandidates(list, { ...ctx, sectionSlug: "delegacia-digital", categoryOf }),
    ).toEqual([]);
  });

  it("editorias permitidas da peça: vazio vale para todas; lista restringe", () => {
    const list = [place("todas"), place("so-cultura", { allowedSections: ["cultura"] })];
    expect(eligibleCandidates(list, ctx).map((c) => c.id)).toEqual(["todas"]);
    expect(eligibleCandidates(list, { ...ctx, sectionSlug: null }).map((c) => c.id)).toEqual([
      "todas",
      "so-cultura",
    ]);
  });

  it("peça paga tira a da casa; sem paga, entra a da casa", () => {
    const pago = place("pago");
    const casa = place("casa", { isHouse: true });
    expect(eligibleCandidates([casa, pago], ctx).map((c) => c.id)).toEqual(["pago"]);
    expect(eligibleCandidates([casa], ctx).map((c) => c.id)).toEqual(["casa"]);
    expect(eligibleCandidates([], ctx)).toEqual([]);
  });
});

describe("pickCandidate (ADS-T1)", () => {
  const desktop = place("desk");
  const mobile = place("mob", { creative: creative(320, 100) });

  it("escolhe pelo aparelho: formato de desktop só no desktop, de celular só no celular", () => {
    expect(pickCandidate([desktop, mobile], { sessionKey: "s1", device: "desktop" })?.id).toBe(
      "desk",
    );
    expect(pickCandidate([desktop, mobile], { sessionKey: "s1", device: "mobile" })?.id).toBe(
      "mob",
    );
    expect(pickCandidate([desktop], { sessionKey: "s1", device: "mobile" })).toBeNull();
  });

  it("rotação estável por sessão e proporcional ao peso", () => {
    const a = place("a", { weight: 3 });
    const b = place("b", { weight: 1 });
    const first = pickCandidate([a, b], { sessionKey: "sessao-x", device: "desktop" });
    for (let i = 0; i < 5; i++)
      expect(pickCandidate([a, b], { sessionKey: "sessao-x", device: "desktop" })?.id).toBe(
        first?.id,
      );
    let countA = 0;
    for (let i = 0; i < 4000; i++)
      if (pickCandidate([a, b], { sessionKey: `s-${i}`, device: "desktop" })?.id === "a") countA++;
    expect(countA / 4000).toBeGreaterThan(0.7);
    expect(countA / 4000).toBeLessThan(0.8);
  });
});
