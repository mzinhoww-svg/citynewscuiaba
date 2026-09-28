import { checklist, type DraftView } from "./checklist";

const ok: DraftView = {
  title: "Prefeitura amplia horário de ônibus noturnos entre CPA e Centro",
  dek: "Duas linhas passam a rodar até meia-noite a partir de novembro.",
  sectionSlug: "mobilidade",
  tags: ["ônibus"],
  neighborhoods: ["cpa"],
  requirePrimary: true,
  sources: [{ role: "primary", confirmed: true }],
  images: [{ credit: "Agência Cerrado", alt: "Ônibus parado no terminal do CPA" }],
  seoTitle: "Ônibus noturnos entre CPA e Centro rodam até meia-noite",
  seoDescription: "Duas linhas passam a rodar até meia-noite a partir de novembro, diz portaria.",
  openSuggestions: 0,
};
const draftSemCredito: DraftView = { ...ok, images: [{ credit: null, alt: "Ônibus no CPA" }] };

it("checklist completo não tem bloqueio", () => {
  const c = checklist(ok);
  expect(c.complete).toBe(true);
  expect(c.blocker).toBeUndefined();
  expect(c.items.map((i) => i.key)).toEqual([
    "title_dek",
    "taxonomy",
    "primary_source",
    "images",
    "seo",
    "ai_suggestions",
  ]);
  expect(c.items.every((i) => i.ok)).toBe(true);
});

it("checklist bloqueia com motivo legível", () => {
  expect(checklist(draftSemCredito).blocker).toBe("Falta crédito da imagem");
  expect(checklist(draftSemCredito).complete).toBe(false);
});

it("cada item tem o próprio motivo, na ordem do checklist", () => {
  expect(checklist({ ...ok, dek: " " }).blocker).toBe("Falta título ou linha fina");
  expect(checklist({ ...ok, tags: [] }).blocker).toBe("Falta editoria, tag ou local");
  expect(checklist({ ...ok, neighborhoods: [] }).blocker).toBe("Falta editoria, tag ou local");
  expect(checklist({ ...ok, sources: [{ role: "primary", confirmed: false }] }).blocker).toBe(
    "Falta fonte primária confirmada",
  );
  expect(checklist({ ...ok, images: [{ credit: "X", alt: null }] }).blocker).toBe(
    "Falta texto alternativo da imagem",
  );
  expect(checklist({ ...ok, seoDescription: null }).blocker).toBe(
    "Falta título ou descrição de SEO",
  );
  expect(checklist({ ...ok, seoTitle: "x".repeat(71) }).blocker).toBe(
    "Título de SEO passa de 70 caracteres",
  );
  expect(checklist({ ...ok, openSuggestions: 2 }).blocker).toBe("Há 2 sugestões de IA sem decisão");
});

it("fonte primária só é exigida quando a regra da categoria pede", () => {
  const c = checklist({ ...ok, requirePrimary: false, sources: [] });
  expect(c.complete).toBe(true);
  expect(c.items.find((i) => i.key === "primary_source")?.label).toBe(
    "Fonte primária (não exigida nesta editoria)",
  );
});

it("sem imagem não bloqueia; o primeiro problema vira o motivo", () => {
  expect(checklist({ ...ok, images: [] }).complete).toBe(true);
  const c = checklist({ ...ok, title: "", openSuggestions: 1 });
  expect(c.blocker).toBe("Falta título ou linha fina");
  expect(c.items.filter((i) => !i.ok).map((i) => i.key)).toEqual(["title_dek", "ai_suggestions"]);
});

describe("rascunho sem IA (B-015)", () => {
  it("fora do rascunho sem IA o item não aparece", () => {
    expect(checklist(ok).items.some((i) => i.key === "ai_fallback")).toBe(false);
    expect(checklist({ ...ok, fallbackPending: null }).complete).toBe(true);
  });

  it("corpo ainda com texto das fontes bloqueia, e é o primeiro motivo", () => {
    const c = checklist({ ...ok, fallbackPending: true });
    expect(c.complete).toBe(false);
    expect(c.blocker).toBe("Rascunho sem IA: reescreva o texto das fontes antes de publicar");
    expect(c.items[0]).toMatchObject({
      key: "ai_fallback",
      ok: false,
      label: "Texto reescrito pela redação (rascunho sem IA)",
    });
  });

  it("reescrito pela redação, o item passa", () => {
    const c = checklist({ ...ok, fallbackPending: false });
    expect(c.complete).toBe(true);
    expect(c.items[0]).toMatchObject({ key: "ai_fallback", ok: true });
  });
});

it("imagem decorativa (alt vazio de propósito) passa; alt não escrito bloqueia", () => {
  expect(checklist({ ...ok, images: [{ credit: "X", alt: "" }] }).complete).toBe(true);
  expect(checklist({ ...ok, images: [{ credit: "X", alt: null }] }).blocker).toBe(
    "Falta texto alternativo da imagem",
  );
  expect(checklist({ ...ok, images: [{ credit: "X", alt: "   " }] }).complete).toBe(false);
});
