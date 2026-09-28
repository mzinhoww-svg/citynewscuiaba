import { kindForStrategy, mapDbError, planBulk, toDbPatch } from "./source-admin-store";

describe("toDbPatch (contrato snake_case de source_admin_update)", () => {
  it("converte camelCase e descarta o que não é coluna editável", () => {
    expect(
      toDbPatch({
        imagePolicy: "reproduction",
        maySoleSource: true,
        frequencyMinutes: null,
        editorialScore: 4,
        termsReviewedAt: "2026-09-27T12:00:00Z",
        feedUrl: "https://x.example/feed",
        kind: "rss",
        // @ts-expect-error: slug não faz parte do patch (identidade da fonte).
        slug: "outra",
      }),
    ).toEqual({
      image_policy: "reproduction",
      may_be_sole_source: true,
      frequency_minutes: null,
      editorial_score: 4,
      terms_reviewed_at: "2026-09-27T12:00:00Z",
      feed_url: "https://x.example/feed",
      kind: "rss",
    });
  });
});

describe("mapDbError", () => {
  it("códigos estáveis para as mensagens de 0011", () => {
    expect(mapDbError({ code: "PT409", message: "conflito de versão: …" })).toBe("conflict");
    expect(mapDbError({ code: "42501", message: "A via rápida está cheia: 1 de 1 fontes." })).toBe(
      "fast_lane_full",
    );
    expect(
      mapDbError({ code: "42501", message: "Ative a fonte antes de colocá-la na via rápida." }),
    ).toBe("fast_lane_inactive");
    expect(
      mapDbError({ code: "42501", message: "sem permissão para gerenciar fontes (source.manage)" }),
    ).toBe("forbidden");
    expect(
      mapDbError({
        code: "42501",
        message:
          "Alterar image_policy exige aprovação de outra pessoa antes de aplicar (source.critical).",
        hint: "Regra de duas pessoas (spec §8).",
      }),
    ).toBe("needs_approval");
    expect(
      mapDbError({
        code: "42501",
        message: "Arquivar exige que a fonte esteja pausada ou bloqueada.",
      }),
    ).toBe("invalid_transition");
    expect(mapDbError({ code: "P0002", message: "fonte x não encontrada" })).toBe("not_found");
    expect(mapDbError({ code: "23505", message: "duplicate key" })).toBe("duplicate");
    expect(mapDbError({ code: "23514", message: "violates check constraint" })).toBe("invalid");
    expect(mapDbError({ message: "fetch failed" })).toBe("unavailable");
  });
});

describe("kindForStrategy", () => {
  it("estratégia → o que o pipeline executa", () => {
    expect(kindForStrategy("atom")).toBe("rss");
    expect(kindForStrategy("jsonfeed")).toBe("api");
    expect(kindForStrategy("sitemap_news")).toBe("sitemap");
    expect(kindForStrategy("page_list")).toBe("page");
  });
});

describe("planBulk (§7.6)", () => {
  const row = (
    id: string,
    over: Partial<Parameters<typeof planBulk>[1][number]> = {},
  ): Parameters<typeof planBulk>[1][number] => ({
    id,
    name: id.toUpperCase(),
    status: "active",
    archived_at: null,
    frequency_minutes: null,
    feed_url: `https://${id}.example/feed`,
    kind: "rss",
    terms_reviewed_at: "2026-08-01T12:00:00Z",
    ...over,
  });

  it("pausar ignora quem já estava pausada, bloqueada ou arquivada", () => {
    const { eligible, results } = planBulk(
      ["a", "b", "c", "d", "z"],
      [
        row("a"),
        row("b", { status: "paused" }),
        row("c", { status: "blocked" }),
        row("d", { status: "paused", archived_at: "2026-09-01T00:00:00Z" }),
      ],
      "pause",
      {},
      { max: 10, used: 0 },
    );
    expect(eligible).toEqual(["a"]);
    expect([...results.values()].map((r) => r.reason)).toEqual([
      "already_paused",
      "blocked",
      "archived",
      "not_found",
    ]);
  });

  it("via rápida em lote enche as vagas na ordem e ignora o resto; troca 10↔20 não ocupa vaga", () => {
    const { eligible, results } = planBulk(
      ["a", "b", "c", "d", "e"],
      [
        row("a"),
        row("b", { frequency_minutes: 20 }),
        row("c"),
        row("d", { status: "paused" }),
        row("e"),
      ],
      "frequency",
      { frequencyMinutes: 10 },
      { max: 3, used: 1 },
    );
    expect(eligible).toEqual(["a", "b", "c"]);
    expect(results.get("d")?.reason).toBe("not_active");
    expect(results.get("e")?.reason).toBe("fast_lane_full");
  });

  it("ativar em lote só quem já passou por ativação (feed e termos)", () => {
    const { eligible, results } = planBulk(
      ["a", "b", "c"],
      [
        row("a", { status: "paused" }),
        row("b", { status: "paused", terms_reviewed_at: null }),
        row("c", { status: "active" }),
      ],
      "activate",
      {},
      { max: 10, used: 0 },
    );
    expect(eligible).toEqual(["a"]);
    expect(results.get("b")?.reason).toBe("not_activated");
    expect(results.get("c")?.reason).toBe("not_paused");
  });
});
