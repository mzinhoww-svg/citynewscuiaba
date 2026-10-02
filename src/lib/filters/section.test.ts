import {
  parseSectionFilters,
  sectionFilterHref,
  serializeSectionFilters,
  widenSectionFilters,
} from "./section";

it("descarta valores inválidos", () => {
  expect(
    parseSectionFilters(new URLSearchParams("periodo=abc&bairro=coxipo&ordem=relevancia")),
  ).toEqual({ period: "7d", neighborhood: "coxipo", order: "relevance", origin: "all", page: 1 });
});

it("sem parâmetros usa os padrões", () => {
  expect(parseSectionFilters(new URLSearchParams())).toEqual({
    period: "7d",
    order: "recent",
    origin: "all",
    page: 1,
  });
});

it("lê todos os filtros válidos", () => {
  const f = parseSectionFilters(
    new URLSearchParams(
      "periodo=30d&bairro=cpa&origem=normalizado&ordem=recentes&sub=mobilidade&page=3",
    ),
  );
  expect(f).toEqual({
    period: "30d",
    neighborhood: "cpa",
    origin: "normalized",
    order: "recent",
    sub: "mobilidade",
    page: 3,
  });
});

it.each([
  ["bairro=nao-existe", { neighborhood: undefined }],
  ["origem=agregado", { origin: "all" }],
  ["page=0", { page: 1 }],
  ["page=-2", { page: 1 }],
  ["page=2.5", { page: 1 }],
  ["page=abc", { page: 1 }],
  ["page=999", { page: 20 }],
  ["sub=<script>", { sub: undefined }],
  ["periodo=7d&periodo=abc", { period: "7d" }],
])("valor inválido em %s não quebra", (qs, expected: Record<string, unknown>) => {
  const f: Record<string, unknown> = { ...parseSectionFilters(new URLSearchParams(qs)) };
  for (const [key, value] of Object.entries(expected)) expect(f[key]).toBe(value);
});

it("aceita o objeto searchParams do Next (valores repetidos viram lista)", () => {
  expect(parseSectionFilters({ periodo: ["24h", "30d"], bairro: "porto" })).toMatchObject({
    period: "24h",
    neighborhood: "porto",
  });
});

it("serializa só o que difere do padrão, na ordem estável", () => {
  expect(
    serializeSectionFilters({
      period: "30d",
      neighborhood: "coxipo",
      order: "relevance",
      origin: "original",
      sub: "mobilidade",
      page: 2,
    }),
  ).toBe("sub=mobilidade&periodo=30d&bairro=coxipo&origem=original&ordem=relevancia&page=2");
  expect(serializeSectionFilters(parseSectionFilters(new URLSearchParams()))).toBe("");
});

it("ida e volta pela URL preserva os filtros", () => {
  const f = parseSectionFilters(new URLSearchParams("periodo=tudo&bairro=porto&origem=original"));
  expect(parseSectionFilters(new URLSearchParams(serializeSectionFilters(f)))).toEqual(f);
});

it("monta o link da editoria sem página e com os filtros", () => {
  const f = parseSectionFilters(new URLSearchParams("periodo=30d&page=3"));
  expect(sectionFilterHref("cidade", f, { page: 1 })).toBe("/cidade?periodo=30d");
  expect(sectionFilterHref("cidade", f, { page: 4 })).toBe("/cidade?periodo=30d&page=4");
});

it("amplia o filtro no estado vazio: período, depois bairro, depois tudo", () => {
  const base = parseSectionFilters(new URLSearchParams("bairro=coxipo&periodo=7d&sub=mobilidade"));
  expect(widenSectionFilters(base)).toMatchObject({ kind: "period", filters: { period: "30d" } });
  const month = { ...base, period: "30d" as const };
  expect(widenSectionFilters(month)).toMatchObject({ kind: "period", filters: { period: "all" } });
  const all = { ...base, period: "all" as const };
  const noBairro = widenSectionFilters(all);
  expect(noBairro?.kind).toBe("neighborhood");
  expect(noBairro?.filters.neighborhood).toBeUndefined();
  const bare = parseSectionFilters(new URLSearchParams("periodo=tudo&origem=original"));
  expect(widenSectionFilters(bare)).toMatchObject({ kind: "reset" });
  expect(widenSectionFilters(parseSectionFilters(new URLSearchParams("periodo=tudo")))).toBeNull();
});
