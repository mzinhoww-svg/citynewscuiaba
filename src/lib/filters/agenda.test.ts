import { agendaHref, agendaRange, parseAgendaFilters } from "./agenda";

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
