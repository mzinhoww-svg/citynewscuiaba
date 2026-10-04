import { describe, expect, it } from "vitest";
import type { DraftContext, DraftItem } from "../ports";
import { PROVISIONAL_TOPIC_TITLE } from "./cluster";
import { fallbackDraft } from "./write";

const item = (n: number, over: Partial<DraftItem> = {}): DraftItem => ({
  id: `i${n}`,
  sourceId: `s${n}`,
  sourceSlug: `fonte-${n}`,
  reliability: "standard",
  title: `Título original ${n} da fonte`,
  excerpt: `Trecho ${n}.`,
  publishedAt: null,
  sourceName: `Fonte ${n}`,
  canonicalUrl: `https://fonte${n}.example/materia`,
  tags: [],
  sensitive: false,
  ...over,
});

const ctxOf = (items: DraftItem[]): DraftContext => ({
  topic: {
    id: "t1",
    slug: "apuracao-t1",
    title: `${PROVISIONAL_TOPIC_TITLE} · Política`,
    sectionSlug: "politica",
    confidence: "média",
    confidenceScore: 0.5,
  },
  items,
  verify: null,
  article: null,
});

describe("fallbackDraft (rascunho sem redação)", () => {
  it("nunca usa o título provisório do assunto: parte do título da fonte principal", () => {
    const d = fallbackDraft(ctxOf([item(1), item(2, { reliability: "primary" })]));
    expect(d.title).toBe("Título original 2 da fonte");
    expect(d.title).not.toContain(PROVISIONAL_TOPIC_TITLE);
  });

  it("sem fonte primária, usa o título do primeiro item", () => {
    expect(fallbackDraft(ctxOf([item(1), item(2)])).title).toBe("Título original 1 da fonte");
  });

  it("linha fina não carrega nota interna (ela fica no motivo da revisão)", () => {
    const d = fallbackDraft(ctxOf([item(1)]));
    expect(d.dek).toBe("");
  });
});
