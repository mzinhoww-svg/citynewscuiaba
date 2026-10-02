import {
  PHASES,
  computeAlerts,
  maskIps,
  logFiltersQuery,
  maskIpsDeep,
  nextSort,
  parseLogFilters,
  phaseOf,
  phaseTimeline,
  runStatus,
  sortRows,
  toCsv,
  type StepStat,
} from ".";

const T0 = "2026-09-28T12:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const stat = (step: string, a: number, b: number, extra: Partial<StepStat> = {}): StepStat => ({
  step,
  ok: 1,
  warn: 0,
  error: 0,
  security: 0,
  firstAt: at(a),
  lastAt: at(b),
  ...extra,
});

describe("fases", () => {
  it("as 20 etapas estão em 6 fases, na ordem da spec", () => {
    expect(PHASES).toHaveLength(6);
    expect(PHASES.flatMap((p) => p.steps)).toHaveLength(20);
    expect(phaseOf("fetch")).toBe("coleta");
    expect(phaseOf("verify")).toBe("verificacao");
    expect(phaseOf("index")).toBe("publicacao");
    expect(phaseOf("desconhecida")).toBeNull();
  });

  it("linha do tempo por fase: início e duração relativos ao início do ciclo, com falhas", () => {
    const tl = phaseTimeline(T0, [
      stat("fetch", 0, 2),
      stat("extract", 1, 4, { error: 2 }),
      stat("classify", 5, 9),
      stat("verify", 10, 11),
    ]);
    expect(tl.map((p) => [p.phase, p.startMin, p.durationMin, p.failed])).toEqual([
      ["coleta", 0, 4, 2],
      ["entendimento", 5, 4, 0],
      ["verificacao", 10, 1, 0],
    ]);
  });
});

describe("runStatus", () => {
  it("pendência na fila = em andamento; falha ou quarentena = com falhas; sem evento = sem coleta", () => {
    expect(
      runStatus({ dbStatus: "running", pending: 3, quarantined: 0, failed: 0, events: 9 }),
    ).toBe("running");
    expect(
      runStatus({ dbStatus: "running", pending: 0, quarantined: 1, failed: 0, events: 9 }),
    ).toBe("partial");
    expect(
      runStatus({ dbStatus: "running", pending: 0, quarantined: 0, failed: 2, events: 9 }),
    ).toBe("partial");
    expect(
      runStatus({ dbStatus: "running", pending: 0, quarantined: 0, failed: 0, events: 0 }),
    ).toBe("empty");
    expect(
      runStatus({ dbStatus: "running", pending: 0, quarantined: 0, failed: 0, events: 5 }),
    ).toBe("ok");
    expect(
      runStatus({ dbStatus: "failed", pending: 0, quarantined: 0, failed: 0, events: 5 }),
    ).toBe("failed");
  });
});

describe("alertas (architecture §10)", () => {
  const base = {
    tickAgeMin: 10,
    queueTotal: 10,
    errors1h: 0,
    events1h: 100,
    spendBrl: 1,
    budgetBrl: 30,
    autoPaused: [] as string[],
  };
  it("sem nada fora do limite, nenhum alerta", () => {
    expect(computeAlerts(base)).toEqual([]);
  });
  it("cada limite gera o seu alerta", () => {
    const ids = computeAlerts({
      tickAgeMin: 50,
      queueTotal: 2001,
      errors1h: 3,
      events1h: 100,
      spendBrl: 27.5,
      budgetBrl: 30,
      autoPaused: ["Cena Cuiabana"],
    }).map((a) => a.id);
    expect(ids).toEqual(["tick_late", "queue_backlog", "error_rate", "budget", "source_paused"]);
  });
  it("sem ciclo nenhum, o tick conta como atrasado", () => {
    expect(computeAlerts({ ...base, tickAgeMin: null }).map((a) => a.id)).toEqual(["tick_late"]);
  });
  it("taxa de erro exatamente em 2% não alerta", () => {
    expect(computeAlerts({ ...base, errors1h: 2, events1h: 100 })).toEqual([]);
  });
});

describe("maskIps", () => {
  it("mascara IPv4 e IPv6 mantendo o prefixo", () => {
    expect(maskIps("connect ECONNREFUSED 203.0.113.45:443")).toBe(
      "connect ECONNREFUSED 203.0.x.x:443",
    );
    expect(maskIps("de 2001:db8:85a3::8a2e:370:7334 ok")).toBe("de 2001:db8:x:x ok");
    expect(maskIps("versão 1.2.3 e 12:30")).toBe("versão 1.2.3 e 12:30");
  });
  it("percorre objetos e listas", () => {
    expect(maskIpsDeep({ a: "10.1.2.3", b: [1, "192.168.0.9"], c: null })).toEqual({
      a: "10.1.x.x",
      b: [1, "192.168.x.x"],
      c: null,
    });
  });
});

describe("toCsv", () => {
  it("escapa aspas, vírgula e quebra de linha e neutraliza fórmula", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["x,y", 'diz "oi"'],
          ["=HYPERLINK(1)", "linha\nnova"],
        ],
      ),
    ).toBe('a,b\r\n"x,y","diz ""oi"""\r\n\'=HYPERLINK(1),"linha\nnova"\r\n');
  });
});

describe("ordenação", () => {
  const rows = [
    { n: "b", v: 2 },
    { n: "a", v: 10 },
    { n: "c", v: null },
  ];
  it("ordena texto com locale pt e números; nulos sempre no fim", () => {
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.n)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.n)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.n)).toEqual(["b", "a", "c"]);
  });
  it("clicar na mesma coluna inverte; em outra começa crescente", () => {
    expect(nextSort({ key: "n", dir: "asc" }, "n")).toEqual({ key: "n", dir: "desc" });
    expect(nextSort({ key: "n", dir: "desc" }, "v")).toEqual({ key: "v", dir: "asc" });
  });
});

describe("filtros dos logs", () => {
  it("aceita só valores válidos e cruza etapa com agente", () => {
    const f = parseLogFilters({
      ciclo: "c4000000-0000-4000-8000-000000000001",
      fonte: "folha-do-cerrado",
      nivel: "error",
      agente: "write",
      q: " timeout ",
      antes: "120",
      item: "drop table",
    });
    expect(f.query).toEqual({
      run: "c4000000-0000-4000-8000-000000000001",
      source: "folha-do-cerrado",
      level: "error",
      q: "timeout",
      steps: ["summarize"],
      before: 120,
    });
    expect(f.form.item).toBeUndefined();
    expect(parseLogFilters({ etapa: "fetch", agente: "write" }).query.steps).toEqual([
      "__nenhuma__",
    ]);
    expect(parseLogFilters({ nivel: "debug", etapa: "x" }).query).toEqual({});
  });

  it("monta a query dos links sem a página", () => {
    expect(logFiltersQuery({ q: "a b", level: "warn" }, { antes: "9" })).toBe(
      "?q=a+b&nivel=warn&antes=9",
    );
    expect(logFiltersQuery({})).toBe("");
  });
});
