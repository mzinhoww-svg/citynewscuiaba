import {
  deriveRunState,
  formatDuration,
  maskIps,
  maskJson,
  nextSortParam,
  parseSort,
  phaseOf,
  phaseSummaries,
  sortRows,
  sourceHealthState,
  stepCounts,
} from "./monitor";
import { STEP_NAMES } from "@/lib/pipeline/types";

describe("fases do ciclo", () => {
  it("toda etapa pertence a uma fase e a ordem das fases segue a das etapas", () => {
    const order = ["coleta", "analise", "redacao", "decisao", "encerramento"];
    const idx = STEP_NAMES.map((s) => order.indexOf(phaseOf(s)));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("duração por fase vai do primeiro ao último evento", () => {
    const r = phaseSummaries([
      {
        step: "fetch",
        level: "info",
        count: 4,
        firstAt: "2026-09-29T10:00:00Z",
        lastAt: "2026-09-29T10:00:30Z",
      },
      {
        step: "normalize",
        level: "error",
        count: 1,
        firstAt: "2026-09-29T10:01:05Z",
        lastAt: "2026-09-29T10:01:05Z",
      },
      {
        step: "rules",
        level: "info",
        count: 2,
        firstAt: "2026-09-29T10:03:00Z",
        lastAt: "2026-09-29T10:03:00Z",
      },
    ]);
    expect(r[0]).toMatchObject({ phase: "coleta", events: 5, errors: 1, durationMs: 65_000 });
    expect(r[1]).toMatchObject({ events: 0, durationMs: 0, startedAt: null });
    expect(r[3]).toMatchObject({ phase: "decisao", events: 2 });
  });

  it("contagem por etapa traz as 20 etapas, com fila e falhas", () => {
    const c = stepCounts(
      [
        { step: "fetch", level: "info", count: 3, firstAt: "", lastAt: "" },
        { step: "fetch", level: "error", count: 2, firstAt: "", lastAt: "" },
        { step: "fetch", level: "security", count: 1, firstAt: "", lastAt: "" },
      ],
      { classify: 7 },
    );
    expect(c).toHaveLength(STEP_NAMES.length);
    expect(c.find((s) => s.step === "fetch")).toMatchObject({ ok: 3, errors: 3, pending: 0 });
    expect(c.find((s) => s.step === "classify")).toMatchObject({ ok: 0, pending: 7 });
  });
});

describe("estado da fonte", () => {
  it("3 falhas seguidas = pausada (auto), qualquer que seja o status", () => {
    expect(sourceHealthState({ status: "active", consecutiveFailures: 3 })).toBe("paused_auto");
    expect(sourceHealthState({ status: "paused", consecutiveFailures: 5 })).toBe("paused_auto");
  });
  it("bloqueada prevalece; 1 ou 2 falhas = degradada; sem falha = ok", () => {
    expect(sourceHealthState({ status: "blocked", consecutiveFailures: 9 })).toBe("blocked");
    expect(sourceHealthState({ status: "active", consecutiveFailures: 2 })).toBe("degraded");
    expect(sourceHealthState({ status: "degraded", consecutiveFailures: 0 })).toBe("degraded");
    expect(sourceHealthState({ status: "paused", consecutiveFailures: 0 })).toBe("paused");
    expect(sourceHealthState({ status: "active", consecutiveFailures: 0 })).toBe("ok");
  });
});

describe("estado da execução", () => {
  const base = {
    dbStatus: "running" as const,
    pending: 0,
    errors: 0,
    events: 10,
    lastEventAt: "2026-09-29T10:00:00Z",
    startedAt: "2026-09-29T09:59:00Z",
  };
  it("com fila ou evento recente, segue em andamento", () => {
    expect(deriveRunState({ ...base, pending: 3, now: new Date("2026-09-29T11:00:00Z") })).toBe(
      "running",
    );
    expect(deriveRunState({ ...base, now: new Date("2026-09-29T10:02:00Z") })).toBe("running");
  });
  it("parado e sem fila: ok, parcial (com erro) ou falhou (sem nenhum evento)", () => {
    const now = new Date("2026-09-29T10:30:00Z");
    expect(deriveRunState({ ...base, now })).toBe("ok");
    expect(deriveRunState({ ...base, errors: 2, now })).toBe("partial");
    expect(deriveRunState({ ...base, events: 0, lastEventAt: null, now })).toBe("failed");
  });
});

describe("ordenação acessível", () => {
  const keys = ["nome", "erros"] as const;
  it("parse: chave válida e direção; inválida cai no padrão", () => {
    const fb = { key: "nome", dir: "asc" } as const;
    expect(parseSort("-erros", keys, fb)).toEqual({ key: "erros", dir: "desc" });
    expect(parseSort("erros", keys, fb)).toEqual({ key: "erros", dir: "asc" });
    expect(parseSort("drop table", keys, fb)).toEqual(fb);
    expect(parseSort(undefined, keys, fb)).toEqual(fb);
  });
  it("clicar de novo na coluna ativa inverte", () => {
    expect(nextSortParam({ key: "nome", dir: "asc" }, "nome")).toBe("-nome");
    expect(nextSortParam({ key: "nome", dir: "desc" }, "nome")).toBe("nome");
    expect(nextSortParam({ key: "nome", dir: "asc" }, "erros")).toBe("erros");
  });
  it("ordena números e texto pt-BR, nulos por último", () => {
    const rows = [
      { n: "Água", e: 2 },
      { n: "Zebra", e: null },
      { n: "Árvore", e: 9 },
    ];
    const v = (r: (typeof rows)[number], k: "nome" | "erros") => (k === "nome" ? r.n : r.e);
    expect(sortRows(rows, { key: "erros", dir: "desc" }, v).map((r) => r.e)).toEqual([9, 2, null]);
    expect(sortRows(rows, { key: "nome", dir: "asc" }, v).map((r) => r.n)).toEqual([
      "Água",
      "Árvore",
      "Zebra",
    ]);
  });
});

describe("máscara de IP", () => {
  it("mascara IPv4 e IPv6 em texto e em JSON, sem tocar no resto", () => {
    expect(maskIps("bloqueado 203.0.113.42 por robots")).toBe("bloqueado 203.0.x.x por robots");
    expect(maskIps("de 2001:db8:1:2::9 ok")).toBe("de 2001:db8:x:x ok");
    expect(maskIps("versão 1.2.3 e hora 10:30:15")).toBe("versão 1.2.3 e hora 10:30:15");
    expect(maskJson({ ip: "10.20.30.40", n: 1 }, false)).toEqual({ ip: "10.20.x.x", n: 1 });
    expect(maskJson({ ip: "10.20.30.40" }, true)).toEqual({ ip: "10.20.30.40" });
  });
});

describe("duração", () => {
  it("formata em pt-BR curto", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(42_000)).toBe("42 s");
    expect(formatDuration(65_000)).toBe("1 min 05 s");
    expect(formatDuration(0)).toBe("0 s");
  });
});
