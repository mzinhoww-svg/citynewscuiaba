import { describe, expect, it } from "vitest";
import { canAutoPublish, type ListDraft, type ListDraftItem } from "./auto-publish";

const item = (n: number, over: Partial<ListDraftItem> = {}): ListDraftItem => ({
  venueId: `v${n}`,
  verified: true,
  sources: 2,
  hasQualitySignal: true,
  ...over,
});

const draft = (over: Partial<ListDraft> = {}): ListDraft => ({
  origin: "template",
  criteria: "Como escolhemos: nota, ranking e menções, só com lugares com duas fontes de dados.",
  sponsored: false,
  items: [1, 2, 3, 4, 5].map((n) => item(n)),
  ...over,
});

describe("canAutoPublish", () => {
  it("lista completa de modelo publica sozinha", () => {
    expect(canAutoPublish(draft())).toEqual({ ok: true, missing: [] });
  });

  it("falha com 4 lugares verificados (mínimo 5)", () => {
    const r = canAutoPublish(draft({ items: [1, 2, 3, 4].map((n) => item(n)) }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("min_venues");
  });

  it("lugar não verificado não conta para o mínimo", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n, n === 5 ? { verified: false } : {}));
    expect(canAutoPublish(draft({ items })).missing).toContain("min_venues");
  });

  it("o mínimo é configurável", () => {
    const items = [1, 2, 3].map((n) => item(n));
    expect(canAutoPublish(draft({ items }), 3).ok).toBe(true);
    expect(canAutoPublish(draft({ items }), 4).ok).toBe(false);
  });

  it.each(["", "   ", "curto"])("falha sem critério escrito (%j)", (criteria) => {
    const r = canAutoPublish(draft({ criteria }));
    expect(r.missing).toContain("criteria");
  });

  it("falha quando algum lugar tem menos de 2 fontes de dados", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n, n === 2 ? { sources: 1 } : {}));
    expect(canAutoPublish(draft({ items })).missing).toContain("sources");
  });

  it("falha quando poucos lugares têm algum sinal de qualidade (nota, ranking ou menção)", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n, { hasQualitySignal: n <= 2 }));
    expect(canAutoPublish(draft({ items })).missing).toContain("quality_signal");
  });

  it("lista patrocinada ou de link/manual nunca publica sozinha", () => {
    expect(canAutoPublish(draft({ sponsored: true })).missing).toContain("needs_human");
    expect(canAutoPublish(draft({ origin: "link" })).missing).toContain("needs_human");
    expect(canAutoPublish(draft({ origin: "manual" })).missing).toContain("needs_human");
  });

  it("lugar repetido conta uma vez só", () => {
    const items = [1, 2, 3, 4].map((n) => item(n)).concat(item(1));
    expect(canAutoPublish(draft({ items })).missing).toContain("min_venues");
  });

  it("junta todos os motivos faltantes", () => {
    const r = canAutoPublish(draft({ criteria: "", items: [item(1, { sources: 1 })] }));
    expect(r.missing).toEqual(
      expect.arrayContaining(["min_venues", "criteria", "sources", "quality_signal"]),
    );
  });
});
