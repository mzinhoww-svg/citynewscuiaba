import {
  displayStatusOf,
  fastLaneFullSkips,
  filterAndSort,
  healthOf,
  parseSourceFilters,
  parseSourceTarget,
  SOURCES_PAGE_SIZE,
  type SourceListRow,
} from "./sources-admin";

describe("parseSourceFilters (inválidos ignorados)", () => {
  it("lê os filtros válidos da URL", () => {
    const f = parseSourceFilters(
      new URLSearchParams(
        "q=folha&status=auto_paused&camada=2&localidade=cuiaba&editoria=cidade&saude=critica&via=rapida&pendente=1&ordem=name&pagina=2",
      ),
    );
    expect(f).toEqual({
      q: "folha",
      status: "auto_paused",
      layer: 2,
      locality: "cuiaba",
      category: "cidade",
      health: "critica",
      via: "rapida",
      pending: true,
      sort: "name",
      dir: "asc",
      page: 2,
    });
  });

  it("valores inválidos voltam ao padrão (score desc, página 1)", () => {
    expect(
      parseSourceFilters(
        new URLSearchParams("status=apagada&camada=9&via=turbo&ordem=x&pagina=-3&editoria=<b>"),
      ),
    ).toMatchObject({
      status: null,
      layer: null,
      via: null,
      sort: "score",
      dir: "desc",
      page: 1,
      category: null,
    });
  });
});

describe("displayStatusOf", () => {
  it("arquivada vence; pausa por falhas vira pausada automaticamente", () => {
    expect(
      displayStatusOf({ status: "paused", status_reason: "auto_failures", archived_at: null }),
    ).toBe("auto_paused");
    expect(
      displayStatusOf({ status: "paused", status_reason: "manual", archived_at: "2026-09-01" }),
    ).toBe("archived");
    expect(displayStatusOf({ status: "degraded", status_reason: null, archived_at: null })).toBe(
      "degraded",
    );
  });
});

describe("healthOf", () => {
  const NOW = new Date("2026-09-27T18:00:00Z");
  it("sem coleta em 30 dias: sem dados", () => {
    expect(healthOf([], NOW, null, 1)).toMatchObject({ score: null, label: "sem_dados" });
  });
  it("erros de hoje e ontem contam como 24 h", () => {
    const h = healthOf(
      [
        {
          day: "2026-09-27",
          source_id: "s",
          fetch_ok: 10,
          fetch_not_modified: 2,
          fetch_failed: 3,
          items_new: 5,
          latency_ms_sum: 0,
          latency_samples: 0,
          last_error: null,
        },
        {
          day: "2026-09-10",
          source_id: "s",
          fetch_ok: 30,
          fetch_not_modified: 0,
          fetch_failed: 5,
          items_new: 9,
          latency_ms_sum: 0,
          latency_samples: 0,
          last_error: null,
        },
      ],
      NOW,
      "2026-09-27T17:30:00Z",
      1,
    );
    expect(h.errors24h).toBe(3);
    expect(h.score).toBeGreaterThan(0);
  });
});

describe("parseSourceTarget", () => {
  it("lê source:<id>:<campo>=<valor>", () => {
    expect(
      parseSourceTarget("source:c5000000-0000-4000-8000-000000000004:image_policy=reproduction"),
    ).toEqual({
      sourceId: "c5000000-0000-4000-8000-000000000004",
      field: "image_policy",
      value: "reproduction",
    });
    expect(parseSourceTarget("role:x")).toBeNull();
  });
});

describe("filterAndSort", () => {
  const base = (i: number, over: Partial<SourceListRow> = {}): SourceListRow => ({
    id: `id-${i}`,
    slug: `s-${i}`,
    name: `Fonte ${String(i).padStart(3, "0")}`,
    domain: `f${i}.example`,
    status: "active",
    statusReason: null,
    displayStatus: "active",
    archived: false,
    layer: 2,
    locality: "cuiaba",
    categories: ["cidade"],
    editorialScore: 3,
    priority: 2,
    frequencyMinutes: null,
    effective: { minutes: 30, raisedBy: null },
    lane: "normal",
    lastFetchedAt: null,
    nextCollectionAt: null,
    operationalScore: null,
    health: "sem_dados",
    errors24h: 0,
    pendingApprovals: 0,
    termsReviewedAt: null,
    version: 1,
    ...over,
  });

  it("padrão: sem arquivadas, score desc e depois nome; 50 por página", () => {
    const rows = Array.from({ length: 60 }, (_, i) => base(i));
    rows[5] = base(5, { editorialScore: 5 });
    rows[6] = base(6, { archived: true, displayStatus: "archived" });
    const page1 = filterAndSort(rows, parseSourceFilters(new URLSearchParams()));
    expect(page1.total).toBe(59);
    expect(page1.rows).toHaveLength(SOURCES_PAGE_SIZE);
    expect(page1.rows[0]?.id).toBe("id-5");
    expect(page1.rows[1]?.name).toBe("Fonte 000");
    const archived = filterAndSort(
      rows,
      parseSourceFilters(new URLSearchParams("status=archived")),
    );
    expect(archived.rows.map((r) => r.id)).toEqual(["id-6"]);
  });

  it("busca sem acento por nome ou domínio, via e pendência", () => {
    const rows = [
      base(1, { name: "Voz do Coxipó", domain: "vozdocoxipo.example", lane: "fast" }),
      base(2, { pendingApprovals: 1 }),
    ];
    expect(filterAndSort(rows, parseSourceFilters(new URLSearchParams("q=coxipo"))).total).toBe(1);
    expect(
      filterAndSort(rows, parseSourceFilters(new URLSearchParams("via=rapida"))).rows[0]?.id,
    ).toBe("id-1");
    expect(
      filterAndSort(rows, parseSourceFilters(new URLSearchParams("pendente=1"))).rows[0]?.id,
    ).toBe("id-2");
  });
});

describe("fastLaneFullSkips", () => {
  it("só o motivo fast_lane_full, uma linha por fonte (o run mais recente)", () => {
    const skips = fastLaneFullSkips([
      {
        id: "run-1",
        started_at: "2026-09-27T14:00:00Z",
        stats: {
          skipped: [
            { slug: "mt-agora", reason: "fast_lane_full" },
            { slug: "folha-do-cerrado", reason: "previous_pending" },
          ],
        },
      },
      {
        id: "run-2",
        started_at: "2026-09-27T14:10:00Z",
        stats: { skipped: [{ slug: "mt-agora", reason: "fast_lane_full" }] },
      },
    ]);
    expect(skips).toEqual([{ slug: "mt-agora", runId: "run-2", at: "2026-09-27T14:10:00Z" }]);
  });

  it("sem skipped ou sem motivo fast_lane_full: lista vazia", () => {
    expect(fastLaneFullSkips([])).toEqual([]);
    expect(
      fastLaneFullSkips([
        { id: "run-1", started_at: "2026-09-27T14:00:00Z", stats: {} },
        {
          id: "run-2",
          started_at: "2026-09-27T14:00:00Z",
          stats: { skipped: [{ slug: "x", reason: "rate_limited" }] },
        },
      ]),
    ).toEqual([]);
  });
});
