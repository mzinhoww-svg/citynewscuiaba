import { describe, expect, it } from "vitest";
import {
  autoChecklist,
  bodyLines,
  CHARS_PER_LINE,
  endsCleanly,
  insufficientMaterial,
  isComplete,
  MIN_BODY_LINES,
  type ArticleCheck,
} from "./auto-checklist";
import { appendCreditLine } from "./credit-line";

const para = (n: number, end = ".") => ({
  type: "paragraph",
  content: [{ type: "text", text: `${"x".repeat(n - 1)}${end}` }],
});
const credited = (blocks: unknown[]) =>
  appendCreditLine({ type: "doc", content: blocks }, [
    { name: "MT Agora", url: "https://mtagora.example/a" },
  ]);
/** Corpo com `lines` linhas (um parágrafo de 3 linhas, repetido). */
const bodyWith = (lines: number, end = ".") =>
  credited(Array.from({ length: Math.ceil(lines / 3) }, () => para(CHARS_PER_LINE * 3, end)));

const base: ArticleCheck = {
  title: "Prefeitura abre obra na avenida do CPA",
  dek: "Obra começa na segunda-feira e dura 40 dias.",
  body: bodyWith(30),
  seoTitle: "Prefeitura abre obra",
  seoDescription: "Obra começa na segunda.",
  tags: ["obra"],
  neighborhoods: ["CPA"],
  sectionSlug: "cidade",
  sourceCount: 1,
  cover: "photo",
  coverAlt: "Máquinas na avenida",
  shortReason: null,
};

describe("autoChecklist (AUT-T4)", () => {
  it("matéria sem alt ganha alt e publica (nenhum bloqueio)", () => {
    const r = autoChecklist({ ...base, coverAlt: null });
    expect(r.blockers).toEqual([]);
    expect(r.fixed).toEqual(["alt"]);
    expect(r.patch.coverAlt).toContain("Prefeitura abre obra");
  });

  it("gera SEO e taxonomia que faltam", () => {
    const r = autoChecklist(
      { ...base, seoTitle: null, seoDescription: "x".repeat(200), tags: [], neighborhoods: [] },
      { tags: ["obra", "avenida"], neighborhoods: ["CPA"] },
    );
    expect(r.fixed).toEqual(expect.arrayContaining(["seo", "taxonomy"]));
    expect(r.patch.seoTitle).toBe(base.title);
    expect(r.patch.seoDescription!.length).toBeLessThanOrEqual(160);
    expect(r.patch.tags).toEqual(["obra", "avenida"]);
    expect(r.patch.neighborhoods).toEqual(["CPA"]);
  });

  it("sem tags nos itens a editoria vira etiqueta", () =>
    expect(autoChecklist({ ...base, tags: [] }).patch.tags).toEqual(["cidade"]));

  it("só no_source e no_title bloqueiam", () => {
    expect(autoChecklist({ ...base, sourceCount: 0 }).blockers).toEqual(["no_source"]);
    expect(
      autoChecklist({ ...base, body: { type: "doc", content: [para(300)] } }).blockers,
    ).toEqual(["no_source"]);
    expect(autoChecklist({ ...base, title: "  " }).blockers).toEqual(["no_title"]);
    expect(autoChecklist({ ...base, seoTitle: null, tags: [] }).blockers).toEqual([]);
  });

  it("nada a consertar não gera patch", () =>
    expect(autoChecklist(base)).toEqual({ fixed: [], blockers: [], patch: {} }));
});

describe("isComplete (A16 e R41)", () => {
  it("corpo de 30 linhas, fonte e capa: completo", () =>
    expect(isComplete(base)).toEqual({ ok: true, missing: [] }));

  it("corpo curto sem short_reason: falta body; com short_reason passa", () => {
    const short = { ...base, body: bodyWith(10) };
    expect(isComplete(short).missing).toEqual(["body"]);
    expect(isComplete({ ...short, shortReason: "insufficient_source" }).ok).toBe(true);
  });

  it("corpo cortado no meio da frase não está completo, nem com short_reason", () => {
    const cut = { ...base, body: bodyWith(30, ""), shortReason: "insufficient_source" as const };
    expect(endsCleanly(cut.body)).toBe(false);
    expect(isComplete(cut).missing).toEqual(["body"]);
  });

  it("sem fonte citada falta source; capa pendente falta cover", () => {
    expect(isComplete({ ...base, sourceCount: 0 }).missing).toEqual(["source"]);
    expect(isComplete({ ...base, cover: "pending" }).missing).toEqual(["cover"]);
    expect(isComplete({ ...base, cover: "typographic" }).ok).toBe(true);
  });

  it("corpo vazio falta body", () =>
    expect(isComplete({ ...base, body: { type: "doc", content: [] } }).missing).toContain("body"));
});

describe("contagem de linhas e material", () => {
  it("conta pelo corpo renderizado, sem a linha de crédito", () => {
    expect(bodyLines(credited([para(CHARS_PER_LINE * 2)]))).toBe(2);
    expect(bodyLines(credited([para(1)]))).toBe(1);
    expect(bodyLines(bodyWith(30))).toBe(MIN_BODY_LINES);
  });
  it("material curto das fontes é insuficiente", () => {
    expect(insufficientMaterial(["a".repeat(400), "b".repeat(300)])).toBe(true);
    expect(insufficientMaterial(["a".repeat(900), "b".repeat(700)])).toBe(false);
  });
});
