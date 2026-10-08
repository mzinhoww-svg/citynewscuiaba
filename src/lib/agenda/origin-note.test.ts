import { describe, expect, it } from "vitest";
import type { EventView } from "@/lib/db/queries/types";
import { organizerConfirmedDate, originNote } from "./origin-note";

type Case = Pick<EventView, "origin" | "sourceName" | "confirmedByName" | "confirmed">;
const e = (c: Case): EventView => ({ ...c }) as EventView;

describe("originNote", () => {
  it("evento de fonte confirmado por outra: informações de A e confirmado por B", () => {
    expect(
      originNote(
        e({
          origin: "organizer",
          sourceName: "Agenda Cuiabana",
          confirmedByName: "Teatro Exemplo",
          confirmed: true,
        }),
      ),
    ).toEqual(["Com informações de Agenda Cuiabana", "Confirmado por Teatro Exemplo"]);
  });

  it("evento de fonte sem confirmação: pede para confirmar na fonte", () => {
    expect(
      originNote(
        e({
          origin: "organizer",
          sourceName: "Agenda Cuiabana",
          confirmedByName: null,
          confirmed: false,
        }),
      ),
    ).toEqual(["Com informações de Agenda Cuiabana", "Confirme na fonte"]);
  });

  it("fonte que confirma o próprio evento: só 'Com informações de', nunca confirmado por ela mesma", () => {
    expect(
      originNote(
        e({
          origin: "organizer",
          sourceName: "Teatro Exemplo",
          confirmedByName: null,
          confirmed: true,
        }),
      ),
    ).toEqual(["Com informações de Teatro Exemplo"]);
  });

  it("redação não tem nota de origem", () => {
    expect(
      originNote(
        e({ origin: "newsroom", sourceName: null, confirmedByName: null, confirmed: true }),
      ),
    ).toEqual([]);
  });

  it("sugestão de leitor e evento sem fonte mantêm o texto atual (sem nota)", () => {
    expect(
      originNote(e({ origin: "reader", sourceName: null, confirmedByName: null, confirmed: true })),
    ).toEqual([]);
    expect(
      originNote(
        e({ origin: "official", sourceName: null, confirmedByName: null, confirmed: true }),
      ),
    ).toEqual([]);
  });
});

describe("organizerConfirmedDate", () => {
  type C = Pick<EventView, "origin" | "sourceName" | "confirmedAt">;
  const ev = (c: C): EventView => ({ ...c }) as EventView;

  it("evento coletado de fonte: a nota de origem substitui a frase da organização", () => {
    expect(
      organizerConfirmedDate(
        ev({
          origin: "organizer",
          sourceName: "Agenda Cuiabana",
          confirmedAt: "2026-10-08T12:00:00Z",
        }),
      ),
    ).toBeNull();
  });

  it("redação nunca afirma confirmação da organização", () => {
    expect(
      organizerConfirmedDate(
        ev({ origin: "newsroom", sourceName: null, confirmedAt: "2026-10-08T12:00:00Z" }),
      ),
    ).toBeNull();
  });

  it("evento antigo sem fonte e confirmado mantém a frase", () => {
    expect(
      organizerConfirmedDate(
        ev({ origin: "official", sourceName: null, confirmedAt: "2026-10-08T12:00:00Z" }),
      ),
    ).toBe("2026-10-08T12:00:00Z");
  });

  it("sem data de confirmação: nada", () => {
    expect(
      organizerConfirmedDate(ev({ origin: "organizer", sourceName: null, confirmedAt: null })),
    ).toBeNull();
  });
});
