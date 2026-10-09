// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAgendaEdition,
  EDITION_MAX_ITEMS,
  groupEditionItems,
  weekendRange,
  type EditionEvent,
} from "./agenda-edition";

const SITE = "https://citynews.example";

/** Instante a partir do relógio de Cuiabá (UTC−4, sem horário de verão). */
const cuiaba = (local: string) => new Date(`${local}-04:00`);

describe("weekendRange", () => {
  it("quinta: o fim de semana que começa no dia seguinte", () => {
    const r = weekendRange(cuiaba("2026-10-08T11:45:00"));
    expect(r.editionDate).toBe("2026-10-09");
    expect(r.start.toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-12T03:59:59.000Z");
    expect(r.days).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("quinta às 23h30 em Cuiabá (já sexta em UTC) continua sendo quinta", () => {
    expect(weekendRange(cuiaba("2026-10-08T23:30:00")).editionDate).toBe("2026-10-09");
  });

  it("sexta, sábado e domingo: o fim de semana corrente", () => {
    for (const local of ["2026-10-09T00:00:00", "2026-10-10T15:00:00", "2026-10-11T23:59:00"])
      expect(weekendRange(cuiaba(local)).editionDate, local).toBe("2026-10-09");
  });

  it("segunda a quarta: o próximo fim de semana; virada de mês", () => {
    expect(weekendRange(cuiaba("2026-10-12T00:30:00")).editionDate).toBe("2026-10-16");
    expect(weekendRange(cuiaba("2026-10-28T09:00:00")).editionDate).toBe("2026-10-30");
    expect(weekendRange(cuiaba("2026-10-28T09:00:00")).days).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});

let seq = 0;
function ev(over: Partial<EditionEvent> = {}): EditionEvent {
  seq += 1;
  return {
    slug: `evento-${seq}`,
    title: `Evento ${seq}`,
    startsAt: "2026-10-10T23:00:00Z",
    endsAt: null,
    venue: "Teatro Fictício",
    neighborhood: null,
    priceCents: 0,
    isFree: true,
    priceUnknown: false,
    origin: "organizer",
    sourceName: "Casa Fictícia",
    confirmedByName: null,
    confirmed: true,
    confirmedAt: "2026-10-01T12:00:00Z",
    withdrawnAt: null,
    ...over,
  };
}

const RANGE = weekendRange(cuiaba("2026-10-08T11:45:00"));

describe("buildAgendaEdition", () => {
  it("menos de 3 eventos: rascunho com motivo", () => {
    const e = buildAgendaEdition([ev(), ev()], RANGE, { siteUrl: SITE });
    expect(e.status).toBe("draft");
    expect(e.reason).toBe("few_events");
    expect(e.items).toHaveLength(2);
  });

  it("nenhum evento: rascunho", () => {
    const e = buildAgendaEdition([], RANGE, { siteUrl: SITE });
    expect(e.status).toBe("draft");
    expect(e.items).toEqual([]);
  });

  it("retirados, não confirmados e fora do fim de semana ficam de fora", () => {
    const e = buildAgendaEdition(
      [
        ev({ title: "Retirado", withdrawnAt: "2026-10-05T00:00:00Z" }),
        ev({ title: "Sem confirmação", confirmedAt: null }),
        ev({ title: "Quinta", startsAt: "2026-10-08T23:00:00Z" }),
        ev({ title: "Segunda", startsAt: "2026-10-12T05:00:00Z" }),
        ev({ title: "A" }),
        ev({ title: "B" }),
      ],
      RANGE,
      { siteUrl: SITE },
    );
    expect(e.items.map((i) => i.title)).toEqual(["A", "B"]);
    expect(e.status).toBe("draft");
  });

  it("evento em cartaz desde antes entra no primeiro dia, com 'desde'", () => {
    const e = buildAgendaEdition(
      [
        ev({
          title: "Exposição",
          startsAt: "2026-10-01T13:00:00Z",
          endsAt: "2026-10-20T22:00:00Z",
        }),
      ],
      RANGE,
      { siteUrl: SITE },
    );
    expect(e.items[0]?.day).toBe("2026-10-09");
    expect(e.items[0]?.when).toBe("Desde 1 out até 20 out, 18h");
  });

  it("ordem: dia, confirmados primeiro, depois horário", () => {
    const e = buildAgendaEdition(
      [
        ev({ title: "Dom 10h", startsAt: "2026-10-11T14:00:00Z" }),
        ev({ title: "Sáb 21h", startsAt: "2026-10-11T01:00:00Z" }),
        ev({ title: "Sáb 9h a confirmar", startsAt: "2026-10-10T13:00:00Z", confirmed: false }),
        ev({ title: "Sáb 19h", startsAt: "2026-10-10T23:00:00Z" }),
        ev({ title: "Sex 20h", startsAt: "2026-10-10T00:00:00Z" }),
      ],
      RANGE,
      { siteUrl: SITE },
    );
    expect(e.status).toBe("ready");
    expect(e.items.map((i) => i.title)).toEqual([
      "Sex 20h",
      "Sáb 19h",
      "Sáb 21h",
      "Sáb 9h a confirmar",
      "Dom 10h",
    ]);
    expect(groupEditionItems(e.items).map((g) => [g.dayLabel, g.items.length])).toEqual([
      ["Sexta-feira, 9 de outubro", 1],
      ["Sábado, 10 de outubro", 3],
      ["Domingo, 11 de outubro", 1],
    ]);
  });

  it("no máximo 12 itens; assunto com o período", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      ev({ startsAt: new Date(Date.parse("2026-10-10T12:00:00Z") + i * 60_000).toISOString() }),
    );
    const e = buildAgendaEdition(many, RANGE, { siteUrl: SITE });
    expect(e.items).toHaveLength(EDITION_MAX_ITEMS);
    expect(e.subject).toBe("Agenda do fim de semana · 9 a 11 de outubro");
    expect(e.rangeLabel).toBe("9 a 11 de outubro");
    expect(e.editionDate).toBe("2026-10-09");
  });

  it("período que cruza o mês", () => {
    const r = weekendRange(cuiaba("2026-10-29T11:45:00"));
    expect(buildAgendaEdition([], r, { siteUrl: SITE }).subject).toBe(
      "Agenda do fim de semana · 30 de outubro a 1 de novembro",
    );
  });

  it("item: quando, onde, preço, origem e link absoluto", () => {
    // O sem confirmação vem depois dos confirmados do mesmo dia.
    const [paid, free, unknown] = buildAgendaEdition(
      [
        ev({
          slug: "show-pago",
          title: "Show pago",
          startsAt: "2026-10-10T00:00:00Z",
          endsAt: "2026-10-10T03:00:00Z",
          neighborhood: "Centro",
          priceCents: 4000,
          isFree: false,
        }),
        ev({
          title: "Sem preço",
          startsAt: "2026-10-10T01:00:00Z",
          priceCents: null,
          isFree: false,
          priceUnknown: true,
          confirmed: false,
        }),
        ev({
          title: "Grátis",
          startsAt: "2026-10-10T02:00:00Z",
          origin: "newsroom",
          sourceName: null,
        }),
      ],
      RANGE,
      { siteUrl: `${SITE}/` },
    ).items;
    expect(paid).toMatchObject({
      title: "Show pago",
      when: "20h até 23h",
      where: "Teatro Fictício, Centro",
      url: "https://citynews.example/agenda/show-pago",
      origin: "Com informações de Casa Fictícia",
    });
    expect(paid?.price).toMatch(/^R\$\s?40,00$/);
    expect(unknown?.price).toBe("Consulte a fonte");
    expect(unknown?.origin).toBe("Com informações de Casa Fictícia · Confirme na fonte");
    expect(free?.price).toBe("Gratuito");
    expect(free?.origin).toBeNull();
  });

  it("mesmo slug duas vezes conta uma", () => {
    const a = ev({ slug: "repetido" });
    const e = buildAgendaEdition([a, { ...a }, ev(), ev()], RANGE, { siteUrl: SITE });
    expect(e.items).toHaveLength(3);
  });
});
