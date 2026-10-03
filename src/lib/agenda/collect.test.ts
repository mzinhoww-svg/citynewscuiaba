import { describe, expect, it } from "vitest";
import { crawlDeps } from "@/lib/sources/http-deps";
import { collectAgenda, type CollectDeps } from "./collect";
import { FIXTURE_AGENDA_SOURCES } from "./sources";
import type { NormalizedEvent } from "./types";

const NOW = new Date("2026-10-03T15:00:00Z");

function deps(over: Partial<CollectDeps> = {}) {
  const saved: NormalizedEvent[] = [];
  const d: CollectDeps = {
    crawl: crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    }),
    sources: FIXTURE_AGENDA_SOURCES,
    now: () => NOW,
    existing: async () => [],
    save: async (events) => {
      saved.push(...events);
      return events.length;
    },
    ...over,
  };
  return { d, saved };
}

describe("collectAgenda (fixtures fictícias)", () => {
  it("coleta, aprova e grava só o que passa nas checagens", async () => {
    const { d, saved } = deps();
    const r = await collectAgenda(d);
    expect(saved.map((e) => e.title).sort()).toEqual(
      [
        "Cine Praça: sessão ao ar livre",
        "Baile da Saudade",
        "Noite do Siriri Moderno",
        "Sarau Aberto da Casa",
        "Peça Cuiabana: O Rasqueado",
        'Exposição "Rios de Cuiabá" abre no Museu do Rio',
        "Festival Cerrado Eletrônico",
      ].sort(),
    );
    expect(r.saved).toBe(7);
    expect(r.sources.find((s) => s.id === "bloqueado-agenda")).toMatchObject({ status: "robots" });
  });
  it("registra os motivos de recusa por fonte", async () => {
    const { d } = deps();
    const r = await collectAgenda(d);
    const casa = r.sources.find((s) => s.id === "cerrado-vivo")!;
    expect(casa.found).toBe(7);
    expect(casa.rejected).toMatchObject({
      data_passada: 1,
      evento_online: 1,
      sem_data: 1,
      palavrao: 1,
      link_suspeito: 1,
      sem_link: 1,
    });
    const ing = r.sources.find((s) => s.id === "ingressosmt")!;
    expect(ing.rejected).toMatchObject({ fora_de_cuiaba: 2 });
    const feed = r.sources.find((s) => s.id === "agendamt")!;
    expect(feed.rejected).toMatchObject({ local_desconhecido: 1 });
    const cal = r.sources.find((s) => s.id === "culturavarzea")!;
    expect(cal.rejected).toMatchObject({ sem_horario: 1 });
  });
  it("evento sem preço na fonte fica com preço não informado", async () => {
    const { d, saved } = deps();
    await collectAgenda(d);
    const f = saved.find((e) => e.title === "Festival Cerrado Eletrônico")!;
    expect(f.priceUnknown).toBe(true);
    expect(f.startsAt).toBe("2026-11-21T22:00:00.000Z");
    expect(f.neighborhood).toBe("Verdão");
  });
  it("não repete evento que já está no ar sem origem de coleta", async () => {
    const { d, saved } = deps({
      existing: async () => [
        {
          title: "Noite do Siriri Moderno",
          startsAt: "2026-10-18T00:00:00.000Z",
          venue: "Casa Cerrado Vivo",
        },
      ],
    });
    const r = await collectAgenda(d);
    expect(saved.some((e) => e.title === "Noite do Siriri Moderno")).toBe(false);
    expect(r.duplicates).toBe(1);
  });
  it("ensaio não grava e devolve a prévia", async () => {
    const { d, saved } = deps({ dryRun: true });
    const r = await collectAgenda(d);
    expect(saved).toHaveLength(0);
    expect(r.saved).toBe(0);
    expect(r.preview).toHaveLength(7);
  });
  it("uma fonte fora do ar não derruba as outras", async () => {
    const { d } = deps({
      sources: [
        {
          ...FIXTURE_AGENDA_SOURCES[0]!,
          id: "fora",
          url: "https://naoexiste.example/calendario.ics",
        },
        FIXTURE_AGENDA_SOURCES[0]!,
      ],
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]?.status).toBe("erro");
    expect(r.sources[1]?.status).toBe("ok");
  });
});
