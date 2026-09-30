import { describe, expect, it } from "vitest";
import cases from "../../../tests/fixtures/push/reserve-cases.json";
import {
  articleTargets,
  cuiabaDay,
  decideReservation,
  effectiveLimit,
  effectiveQuiet,
  isQuiet,
  PLATFORM_QUIET,
  quietEndsAt,
  retryDelay,
  scheduleProblem,
  type ReserveInput,
} from "./rules";

const NOW = "2026-09-28T15:00:00Z";
const base: ReserveInput = {
  kind: "follow",
  want: { follow: true, urgent: true, highlight: true },
  quiet: PLATFORM_QUIET,
  limit: 3,
  dayKey: null,
  dayCount: 0,
  hasArticle: false,
  ttlEndsAt: "2026-09-28T21:00:00Z",
  now: NOW,
};
const input = (p: Partial<ReserveInput>): ReserveInput => ({ ...base, ...p });

describe("decideReservation", () => {
  it("fixture tem pelo menos 20 casos", () => expect(cases.length).toBeGreaterThanOrEqual(20));
  it.each(cases as { name: string; input: ReserveInput; expected: unknown }[])(
    "paridade: $name",
    ({ input: i, expected }) => expect(decideReservation(i)).toEqual(expected),
  );

  it("silêncio efetivo é a união: leitor 20h–9h com plataforma 22h–7h", () => {
    expect(effectiveQuiet({ start: 20, end: 9 }, PLATFORM_QUIET)).toEqual({ start: 20, end: 9 });
    expect(effectiveQuiet({ start: 22, end: 7 }, { start: 21, end: 8 })).toEqual({
      start: 21,
      end: 8,
    });
    expect(effectiveLimit(3, 2)).toBe(2);
    expect(effectiveLimit(1, 3)).toBe(1);
    expect(effectiveLimit(9, 0)).toBe(3);
  });

  it("21:59 não é silêncio; 22:00 é; 06:59 é; 07:00 não (Cuiabá)", () => {
    const q = PLATFORM_QUIET;
    expect([
      isQuiet(q, new Date("2026-09-29T01:59:00Z")),
      isQuiet(q, new Date("2026-09-29T02:00:00Z")),
      isQuiet(q, new Date("2026-09-29T10:59:00Z")),
      isQuiet(q, new Date("2026-09-29T11:00:00Z")),
    ]).toEqual([false, true, true, false]);
    expect(quietEndsAt(q, new Date("2026-09-29T02:00:00Z")).toISOString()).toBe(
      "2026-09-29T11:00:00.000Z",
    );
    expect(quietEndsAt(q, new Date("2026-09-29T10:59:00Z")).toISOString()).toBe(
      "2026-09-29T11:00:00.000Z",
    );
  });

  it("dia de Cuiabá vira às 04:00Z", () => {
    expect(cuiabaDay(new Date("2026-09-29T03:59:59Z"))).toBe("2026-09-28");
    expect(cuiabaDay(new Date("2026-09-29T04:00:00Z"))).toBe("2026-09-29");
  });

  it("urgente passa no silêncio mas respeita o limite", () => {
    expect(decideReservation(input({ kind: "urgent", now: "2026-09-29T03:00:00Z" })).outcome).toBe(
      "ok",
    );
    expect(
      decideReservation(
        input({ kind: "urgent", dayCount: 3, dayKey: "2026-09-28", now: "2026-09-29T03:00:00Z" }),
      ).outcome,
    ).toBe("skipped_limit");
  });

  it("retry 1, 4, 10 min respeitando Retry-After até 30 min", () => {
    expect([1, 2, 3].map((a) => retryDelay(a, null))).toEqual([60, 240, 600]);
    expect(retryDelay(1, 900)).toBe(900);
    expect(retryDelay(1, 7200)).toBe(1800);
    expect(retryDelay(2, 30)).toBe(240);
    expect(retryDelay(4, null)).toBeNull();
  });

  it("alvos da matéria: fontes, editoria, assunto e bairros", () => {
    expect(
      articleTargets({
        sourceSlugs: ["folha-do-cerrado"],
        sectionSlug: "cidade",
        topicSlug: null,
        neighborhoods: ["cpa"],
      }),
    ).toEqual(["source:folha-do-cerrado", "section:cidade", "bairro:cpa"]);
    expect(
      articleTargets({
        sourceSlugs: ["a", "a"],
        sectionSlug: "Inválida!",
        topicSlug: "x",
        neighborhoods: [],
      }),
    ).toEqual(["source:a", "topic:x"]);
  });

  it("Destaque agendado: passado, > 7 dias e 22h–7h recusados; urgente só agora", () => {
    expect(scheduleProblem("urgent", { type: "now" }, NOW)).toBeNull();
    expect(scheduleProblem("urgent", { type: "at", at: "2026-09-28T20:00:00Z" }, NOW)).toBe(
      "urgent_now_only",
    );
    expect(scheduleProblem("highlight", { type: "at", at: "2026-09-29T03:00:00Z" }, NOW)).toBe(
      "quiet",
    );
    expect(scheduleProblem("highlight", { type: "at", at: "2026-10-06T15:00:00Z" }, NOW)).toBe(
      "too_far",
    );
    expect(scheduleProblem("highlight", { type: "at", at: "2026-09-28T14:00:00Z" }, NOW)).toBe(
      "past",
    );
    expect(
      scheduleProblem("highlight", { type: "at", at: "2026-09-29T15:00:00Z" }, NOW),
    ).toBeNull();
    expect(scheduleProblem("highlight", { type: "at", at: "lixo" }, NOW)).toBe("invalid");
  });
});
