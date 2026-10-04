import { describe, expect, it } from "vitest";
import { PIN_DURATIONS, pinEndsAt, validatePin, type PinCheck } from "./validate";
import type { Slot } from "./types";

const NOW = new Date("2026-10-03T18:10:00Z");
const HOUR = 3_600_000;
const slot: Slot = { key: "home.lead", page: "home", label: "Início · manchete", capacity: 1 };

function check(over: Partial<PinCheck> = {}): PinCheck {
  return {
    slot,
    sectionSlug: null,
    article: { status: "published", sponsored: false, hasCover: true },
    endsAt: new Date(NOW.getTime() + 6 * HOUR),
    activeInSlot: 0,
    now: NOW,
    ...over,
  };
}

describe("validatePin", () => {
  it("aceita prazos de 1 h a 3 dias e data final futura", () => {
    for (const h of [1, 3, 6, 12, 24, 72]) {
      expect(validatePin(check({ endsAt: new Date(NOW.getTime() + h * HOUR) })).ok).toBe(true);
    }
    expect(validatePin(check({ endsAt: new Date(NOW.getTime() + 10 * 24 * HOUR) })).ok).toBe(true);
  });

  it("aceita sem prazo (fica até remover, R28)", () => {
    const r = validatePin(check({ endsAt: null }));
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ endsAt: null }) });
  });

  it("recusa prazo no passado, igual a agora ou com mais de 14 dias", () => {
    expect(validatePin(check({ endsAt: new Date(NOW.getTime() - HOUR) }))).toEqual({
      ok: false,
      error: "duration",
    });
    expect(validatePin(check({ endsAt: NOW }))).toEqual({ ok: false, error: "duration" });
    expect(validatePin(check({ endsAt: new Date(NOW.getTime() + 15 * 24 * HOUR) }))).toEqual({
      ok: false,
      error: "duration",
    });
  });

  it("recusa matéria patrocinada, rascunho e outras não publicadas", () => {
    for (const article of [
      { status: "published", sponsored: true, hasCover: true },
      { status: "draft", sponsored: false, hasCover: true },
      { status: "unpublished", sponsored: false, hasCover: true },
    ]) {
      expect(validatePin(check({ article }))).toEqual({ ok: false, error: "ineligible" });
    }
    expect(
      validatePin(check({ article: { status: "updated", sponsored: false, hasCover: true } })).ok,
    ).toBe(true);
  });

  it("R39: recusa matéria sem capa aprovada", () => {
    expect(
      validatePin(check({ article: { status: "published", sponsored: false, hasCover: false } })),
    ).toEqual({
      ok: false,
      error: "no_cover",
    });
  });

  it("recusa quando a posição está cheia", () => {
    expect(validatePin(check({ activeInSlot: 1 }))).toEqual({ ok: false, error: "capacity" });
    expect(validatePin(check({ slot: { ...slot, capacity: 3 }, activeInSlot: 2 })).ok).toBe(true);
  });

  it("recusa posição inexistente e editoria faltando em editoria.lead", () => {
    expect(validatePin(check({ slot: undefined }))).toEqual({ ok: false, error: "slot" });
    const ed: Slot = { key: "editoria.lead", page: "editoria", label: "Editoria", capacity: 1 };
    expect(validatePin(check({ slot: ed, sectionSlug: null }))).toEqual({
      ok: false,
      error: "slot",
    });
    expect(validatePin(check({ slot: ed, sectionSlug: "politica" })).ok).toBe(true);
    expect(validatePin(check({ sectionSlug: "politica" }))).toEqual({ ok: false, error: "slot" });
  });
});

describe("pinEndsAt", () => {
  it("converte os botões de prazo em data final", () => {
    expect(pinEndsAt("1h", NOW)).toEqual(new Date(NOW.getTime() + HOUR));
    expect(pinEndsAt("3d", NOW)).toEqual(new Date(NOW.getTime() + 72 * HOUR));
    expect(pinEndsAt("until_removed", NOW)).toBeNull();
    const until = new Date(NOW.getTime() + 5 * HOUR);
    expect(pinEndsAt({ until }, NOW)).toEqual(until);
    expect(PIN_DURATIONS).toEqual(["1h", "3h", "6h", "12h", "24h", "3d", "until_removed"]);
  });
});
