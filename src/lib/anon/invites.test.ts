import { describe, expect, it } from "vitest";
import {
  INVITE_WINDOW_DAYS,
  parseInviteHistory,
  pickOnboardingSources,
  recordInvite,
  shouldShowFirstVisit,
  shouldShowInvite,
} from "./invites";

describe("convite de login (spec §5.4)", () => {
  it("mesmo gatilho não repete em 7 dias", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(shouldShowInvite("save", [{ trigger: "save", at: "2026-09-22T12:00:00Z" }], now)).toBe(
      false,
    );
    expect(shouldShowInvite("save", [{ trigger: "save", at: "2026-09-20T11:00:00Z" }], now)).toBe(
      true,
    );
    expect(shouldShowInvite("follow", [{ trigger: "save", at: "2026-09-27T11:00:00Z" }], now)).toBe(
      true,
    );
  });

  it("sem histórico mostra; exatamente 7 dias depois volta a mostrar", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(shouldShowInvite("alert", [], now)).toBe(true);
    const at = new Date(now.getTime() - INVITE_WINDOW_DAYS * 86_400_000).toISOString();
    expect(shouldShowInvite("alert", [{ trigger: "alert", at }], now)).toBe(true);
  });

  it("registro guarda um por gatilho e descarta o que venceu", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const h = recordInvite(
      [
        { trigger: "save", at: "2026-09-01T00:00:00Z" },
        { trigger: "follow", at: "2026-09-26T00:00:00Z" },
      ],
      "save",
      now,
    );
    expect(h).toEqual([
      { trigger: "follow", at: "2026-09-26T00:00:00Z" },
      { trigger: "save", at: now.toISOString() },
    ]);
  });

  it("histórico corrompido vira lista vazia ou só o que é válido", () => {
    expect(parseInviteHistory("não é json")).toEqual([]);
    expect(parseInviteHistory(null)).toEqual([]);
    expect(
      parseInviteHistory(
        JSON.stringify([
          { trigger: "save", at: "2026-09-27T00:00:00Z" },
          { trigger: "hack", at: "2026-09-27T00:00:00Z" },
          { trigger: "follow", at: "ontem" },
        ]),
      ),
    ).toEqual([{ trigger: "save", at: "2026-09-27T00:00:00Z" }]);
  });
});

describe("primeira visita (P23)", () => {
  it("aparece a partir de 3 leituras qualificadas e só enquanto não decidido", () => {
    expect(shouldShowFirstVisit(2, false)).toBe(false);
    expect(shouldShowFirstVisit(3, false)).toBe(true);
    expect(shouldShowFirstVisit(5, false)).toBe(true);
    expect(shouldShowFirstVisit(3, true)).toBe(false);
  });

  it("seletor com 12 fontes: 6 locais, 3 estaduais e 3 temáticas", () => {
    const mk = (slug: string, locality: string, score: number, categories: string[] = []) => ({
      slug,
      name: slug,
      locality,
      categories,
      score,
    });
    const all = [
      mk("l1", "cuiaba", 0.9),
      mk("l2", "cuiaba", 0.8),
      mk("l3", "varzea-grande", 0.7),
      mk("l4", "cuiaba", 0.6),
      mk("l5", "cuiaba", 0.5),
      mk("l6", "cuiaba", 0.4),
      mk("l7", "cuiaba", 0.3, ["cultura"]),
      mk("m1", "mt", 0.9),
      mk("m2", "mt", 0.8),
      mk("m3", "mt", 0.7),
      mk("m4", "mt", 0.6, ["esportes"]),
      mk("n1", "nacional", 0.5, ["economia"]),
    ];
    const picked = pickOnboardingSources(all);
    expect(picked.map((p) => p.group)).toEqual([
      ...Array(6).fill("local"),
      ...Array(3).fill("state"),
      ...Array(3).fill("theme"),
    ]);
    expect(picked.filter((p) => p.group === "local").map((p) => p.slug)).toEqual([
      "l1",
      "l2",
      "l3",
      "l4",
      "l5",
      "l6",
    ]);
    expect(picked.filter((p) => p.group === "theme").map((p) => p.slug)).toEqual([
      "m4",
      "n1",
      "l7",
    ]);
    expect(new Set(picked.map((p) => p.slug)).size).toBe(12);
  });

  it("com poucas fontes, completa com o que houver sem repetir", () => {
    const picked = pickOnboardingSources([
      { slug: "a", name: "A", locality: "mt", categories: [], score: 1 },
      { slug: "b", name: "B", locality: "cuiaba", categories: [], score: 1 },
    ]);
    expect(picked.map((p) => p.slug).sort()).toEqual(["a", "b"]);
  });
});
