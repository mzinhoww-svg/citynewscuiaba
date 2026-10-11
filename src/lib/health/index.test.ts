import { describe, expect, it } from "vitest";
import { checkHealth, healthResponse } from "./index";

const NOW = new Date("2026-10-11T15:00:00Z");

describe("checkHealth", () => {
  it("banco de pé: ok e idade da última matéria em minutos", async () => {
    const r = await checkHealth({
      newestPublishedAt: async () => "2026-10-11T13:30:00Z",
      now: () => NOW,
    });
    expect(r).toEqual({ ok: true, db: true, newestArticleAgeMin: 90 });
  });

  it("sem matéria publicada: ok, idade desconhecida", async () => {
    const r = await checkHealth({ newestPublishedAt: async () => null, now: () => NOW });
    expect(r).toEqual({ ok: true, db: true, newestArticleAgeMin: null });
  });

  it("banco falhou (ex.: cota de saída excedida): não ok", async () => {
    const r = await checkHealth({
      newestPublishedAt: async () => {
        throw new Error("exceed_egress_quota");
      },
      now: () => NOW,
    });
    expect(r).toEqual({ ok: false, db: false, newestArticleAgeMin: null });
  });
});

describe("healthResponse", () => {
  it("200 quando ok e 503 quando o banco falhou, sem expor mensagem de erro", async () => {
    const up = healthResponse({ ok: true, db: true, newestArticleAgeMin: 5 });
    const down = healthResponse({ ok: false, db: false, newestArticleAgeMin: null });
    expect(up.status).toBe(200);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ok: false, db: false, newestArticleAgeMin: null });
  });
});
