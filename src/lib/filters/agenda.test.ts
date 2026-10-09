import { agendaHref, agendaRange, agesUpTo, isUnfilteredList, parseAgendaFilters } from "./agenda";

const now = new Date("2026-09-30T15:00:00Z"); // quarta, 11h em Cuiabá

it("lê filtros válidos e descarta o resto", () => {
  expect(
    parseAgendaFilters(
      new URLSearchParams(
        "view=cal&gratuito=1&criancas=1&categoria=musica&bairro=porto&origem=oficial&quando=fim-de-semana&mes=2026-10",
      ),
    ),
  ).toEqual({
    view: "cal",
    free: true,
    kids: true,
    category: "musica",
    neighborhood: "porto",
    origin: "official",
    when: "weekend",
    month: "2026-10",
  });
  expect(
    parseAgendaFilters(
      new URLSearchParams("view=x&gratuito=sim&categoria=<b>&quando=ontem&dia=2026-13-40&mes=abc"),
    ),
  ).toEqual({ view: "list", free: false, kids: false, when: "30d" });
});

it("dia válido vence o período", () => {
  expect(parseAgendaFilters(new URLSearchParams("dia=2026-10-03&quando=7-dias"))).toMatchObject({
    day: "2026-10-03",
  });
});

it("intervalos no fuso de Cuiabá", () => {
  const f = parseAgendaFilters(new URLSearchParams());
  expect(agendaRange({ ...f, when: "today" }, now)).toEqual({
    from: "2026-09-30T15:00:00.000Z",
    to: "2026-10-01T04:00:00.000Z",
  });
  expect(agendaRange({ ...f, when: "weekend" }, now)).toEqual({
    from: "2026-10-03T04:00:00.000Z",
    to: "2026-10-05T04:00:00.000Z",
  });
  expect(agendaRange({ ...f, day: "2026-10-03" }, now)).toEqual({
    from: "2026-10-03T04:00:00.000Z",
    to: "2026-10-04T04:00:00.000Z",
  });
  expect(agendaRange({ ...f, view: "cal", month: "2026-10" }, now)).toEqual({
    from: "2026-10-01T04:00:00.000Z",
    to: "2026-11-01T04:00:00.000Z",
  });
  expect(agendaRange(f, now).to).toBe("2026-10-30T15:00:00.000Z");
});

it("fim de semana no sábado começa agora", () => {
  const sat = new Date("2026-10-03T14:00:00Z");
  expect(
    agendaRange({ ...parseAgendaFilters(new URLSearchParams()), when: "weekend" }, sat),
  ).toEqual({
    from: "2026-10-03T14:00:00.000Z",
    to: "2026-10-05T04:00:00.000Z",
  });
});

it("links mantêm o filtro de gratuitos ao trocar de visão", () => {
  const f = parseAgendaFilters(new URLSearchParams("gratuito=1"));
  expect(agendaHref(f, { view: "cal" })).toBe("/agenda?view=cal&gratuito=1");
  expect(agendaHref(f)).toBe("/agenda?gratuito=1");
});

it("atalho Amanhã: lê a URL, monta o link e cobre só o dia seguinte no fuso de Cuiabá", () => {
  const f = parseAgendaFilters(new URLSearchParams("quando=amanha"));
  expect(f.when).toBe("tomorrow");
  expect(agendaHref(f)).toBe("/agenda?quando=amanha");
  expect(agendaRange(f, now)).toEqual({
    from: "2026-10-01T04:00:00.000Z",
    to: "2026-10-02T04:00:00.000Z",
  });
});

describe("faixa etária na URL (ARD-T4, ?idade=)", () => {
  it("lê as faixas da lista fechada e monta o link de volta", () => {
    for (const idade of ["livre", "10", "12", "14", "16", "18"] as const) {
      const f = parseAgendaFilters(new URLSearchParams(`idade=${idade}`));
      expect(f.age).toBe(idade);
      expect(agendaHref(f)).toBe(`/agenda?idade=${idade}`);
    }
  });

  it("valor inválido é ignorado (inclusive consulte, que não é filtro)", () => {
    for (const idade of ["consulte", "15", "abc", "", "-1"]) {
      expect(parseAgendaFilters(new URLSearchParams(`idade=${idade}`)).age).toBeUndefined();
    }
  });

  it("faixas aceitas: até a escolhida, livre conta como 0, consulte nunca", () => {
    expect(agesUpTo("livre")).toEqual(["livre"]);
    expect(agesUpTo("12")).toEqual(["livre", "10", "12"]);
    expect(agesUpTo("18")).toEqual(["livre", "10", "12", "14", "16", "18"]);
    expect(agesUpTo("18")).not.toContain("consulte");
  });

  it("sem filtro do visitante só na lista de 30 dias sem nenhum filtro", () => {
    expect(isUnfilteredList(parseAgendaFilters(new URLSearchParams()))).toBe(true);
    for (const qs of [
      "idade=12",
      "criancas=1",
      "gratuito=1",
      "categoria=musica",
      "bairro=porto",
      "origem=oficial",
      "quando=hoje",
      "dia=2026-10-03",
      "view=cal",
    ]) {
      expect(isUnfilteredList(parseAgendaFilters(new URLSearchParams(qs))), qs).toBe(false);
    }
  });
});
