import { describe, expect, it } from "vitest";
import { createCallAgent, type CallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import type { FetchOutcome } from "@/lib/sources/status";
import { crawlDeps } from "@/lib/sources/http-deps";
import {
  AI_DEADLINE_MS,
  AI_HARD_DEADLINE_MS,
  collectAgenda,
  type CollectDeps,
  type StoredCollected,
} from "./collect";
import { dedupeKeyOf } from "./normalize";
import { FIXTURE_AGENDA_SOURCES } from "./sources";
import type { AgendaSource, NormalizedEvent } from "./types";

const NOW = new Date("2026-10-03T15:00:00Z");

const byId = (id: string): AgendaSource => {
  const s = FIXTURE_AGENDA_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`fonte de fixture ausente: ${id}`);
  return s;
};
const TEATRO = byId("teatro-cerrado");
const INGRESSOS = byId("ingressosmt");

function deps(over: Partial<CollectDeps> = {}) {
  const saved: NormalizedEvent[] = [];
  const cache = new Map<string, unknown>();
  const states: { uuid: string; outcome: FetchOutcome; detail?: string }[] = [];
  const fake = createFakeProvider();
  const callAgent = createCallAgent({
    store: createMemoryAiStore(),
    provider: fake,
    now: () => NOW,
  });
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
    callAgent,
    cache: {
      get: async (url, hash) => cache.get(`${url}#${hash}`) ?? null,
      put: async (url, hash, result) => void cache.set(`${url}#${hash}`, result),
    },
    aiBudget: { perRun: 40, remainingToday: 160 },
    monotonic: () => 0,
    stored: async () => [],
    sourceState: async (uuid, outcome, detail) => void states.push({ uuid, outcome, detail }),
    ...over,
  };
  return { d, saved, cache, states, fake };
}

const FESTIVAL_TEATRO_KEY = dedupeKeyOf(
  "Festival Cerrado Eletrônico",
  "2026-11-21T23:00:00.000Z",
  "Arena Pantanal Fictícia",
);
const FORRO_KEY = dedupeKeyOf("Forró da Praça", "2026-10-25T00:00:00.000Z", "Teatro Cerrado");

function storedRow(over: Partial<StoredCollected> & { dedupeKey: string }): StoredCollected {
  return {
    id: `id-${over.dedupeKey}`,
    lockedFields: [],
    withdrawnAt: null,
    title: "Forró da Praça",
    startsAt: "2026-10-25T00:00:00.000Z",
    endsAt: null,
    venue: "Teatro Cerrado",
    neighborhood: null,
    priceCents: null,
    priceUnknown: true,
    category: "musica",
    description: "Descrição guardada.",
    sourceUrl: "https://teatro-cerrado.example/evento/forro-da-praca",
    sourceId: "teatro-cerrado",
    sourceRef: TEATRO.uuid,
    origin: "organizer",
    confirms: true,
    confirmedBySourceId: null,
    evidence: {},
    ...over,
  };
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
        "Forró da Praça",
        "Sarau da Casa Exemplo",
        "Oficina de Cerâmica",
      ].sort(),
    );
    expect(r.saved).toBe(10);
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
    expect(casa.rejectedSamples.length).toBeGreaterThanOrEqual(6);
    expect(casa.rejectedSamples.length).toBeLessThanOrEqual(10);
    expect(casa.rejectedSamples[0]).toHaveProperty("reason");
    const ing = r.sources.find((s) => s.id === "ingressosmt")!;
    expect(ing.rejected).toMatchObject({ fora_de_cuiaba: 2 });
    const feed = r.sources.find((s) => s.id === "agendamt")!;
    expect(feed.rejected).toMatchObject({ local_desconhecido: 1 });
    const cal = r.sources.find((s) => s.id === "culturavarzea")!;
    expect(cal.rejected).toMatchObject({ sem_horario: 1 });
    const tribe = r.sources.find((s) => s.id === "eventos-cerrado")!;
    expect(tribe).toMatchObject({ status: "ok", found: 3, approved: 2 });
  });

  it("evento sem preço na fonte fica com preço não informado", async () => {
    const { d, saved } = deps({ sources: [INGRESSOS] });
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
    expect(r.duplicates).toBeGreaterThanOrEqual(1);
  });

  it("ensaio não grava (nem cache nem estado da fonte) e devolve a prévia com evidência", async () => {
    const { d, saved, cache, states } = deps({ dryRun: true });
    const r = await collectAgenda(d);
    expect(saved).toHaveLength(0);
    expect(r.saved).toBe(0);
    expect(r.preview).toHaveLength(10);
    expect(cache.size).toBe(0);
    expect(states).toHaveLength(0);
    const forro = r.preview?.find((p) => p.title === "Forró da Praça");
    expect(forro?.sourceId).toBe("teatro-cerrado");
    expect(forro?.evidence.data?.trecho).toBe("sábado, 24 de outubro de 2026");
  });

  it("prévia de uma fonte só (mesmo pausada) com onlySourceId", async () => {
    const { d } = deps({
      dryRun: true,
      sources: [{ ...TEATRO, enabled: false }, INGRESSOS],
      onlySourceId: TEATRO.uuid,
    });
    const r = await collectAgenda(d);
    expect(r.sources.map((s) => s.id)).toEqual(["teatro-cerrado"]);
    expect(r.preview).toHaveLength(2);
  });

  it("prévia limitada: maxEventPages corta as páginas de evento sem adiar a fonte", async () => {
    const { d, fake } = deps({
      dryRun: true,
      sources: [{ ...TEATRO, enabled: false }],
      onlySourceId: TEATRO.uuid,
      aiBudget: { perRun: 2, remainingToday: 2 },
      maxEventPages: 1,
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]).toMatchObject({ status: "ok", found: 1, approved: 1, aiPages: 2 });
    expect(r.preview?.map((p) => p.title)).toEqual(["Forró da Praça"]);
    expect(fake.calls.length).toBe(2);
  });

  it("prévia com cacheWritesInDryRun grava o cache (só ele) e a 2ª prévia não chama o modelo", async () => {
    const { d, saved, cache, states, fake } = deps({
      dryRun: true,
      cacheWritesInDryRun: true,
      sources: [{ ...TEATRO, enabled: false }],
      onlySourceId: TEATRO.uuid,
    });
    const first = await collectAgenda(d);
    expect(first.preview).toHaveLength(2);
    // Listagem + 3 páginas no cache; nenhum evento, estado de fonte nem gravação.
    expect(cache.size).toBe(4);
    expect(saved).toHaveLength(0);
    expect(states).toHaveLength(0);
    const calls = fake.calls.length;
    const second = await collectAgenda(d);
    expect(fake.calls.length).toBe(calls);
    expect(second.sources[0]).toMatchObject({ aiPages: 0, approved: 2 });
    expect(second.preview).toHaveLength(2);
  });

  it("ensaio sem a flag continua sem gravar cache", async () => {
    const { d, cache } = deps({ dryRun: true, sources: [TEATRO], onlySourceId: TEATRO.id });
    await collectAgenda(d);
    expect(cache.size).toBe(0);
  });

  it("maxEventPages nunca passa do teto que sobrou depois da listagem", async () => {
    const { d } = deps({
      dryRun: true,
      sources: [TEATRO],
      onlySourceId: TEATRO.id,
      aiBudget: { perRun: 3, remainingToday: 160 },
      maxEventPages: 5,
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]).toMatchObject({ status: "ok", found: 2, aiPages: 3 });
  });

  it("uma fonte fora do ar não derruba as outras", async () => {
    const { d } = deps({
      sources: [
        {
          ...FIXTURE_AGENDA_SOURCES[1]!,
          id: "fora",
          url: "https://naoexiste.example/calendario.ics",
        },
        FIXTURE_AGENDA_SOURCES[1]!,
      ],
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]?.status).toBe("erro");
    expect(r.sources[1]?.status).toBe("ok");
  });
});

describe("collectAgenda · caminho ai_page", () => {
  it("lê a listagem, abre as páginas e aprova com o trecho de evidência", async () => {
    const { d, saved } = deps({ sources: [TEATRO] });
    const r = await collectAgenda(d);
    const rep = r.sources[0]!;
    expect(rep).toMatchObject({ id: "teatro-cerrado", status: "ok", found: 3, approved: 2 });
    // Listagem + 3 páginas: as quatro chamadas ao modelo contam no teto.
    expect(rep.aiPages).toBe(4);
    // A página de cartaz sem ano ("10/01") é recusada, nunca adivinhada.
    expect(rep.rejected).toEqual({ sem_ano: 1 });
    expect(rep.rejectedSamples).toEqual([
      { url: "https://teatro-cerrado.example/evento/sarau-de-verao", reason: "sem_ano" },
    ]);
    expect(saved).toHaveLength(2);
    const forro = saved.find((e) => e.title === "Forró da Praça")!;
    expect(forro.startsAt).toBe("2026-10-25T00:00:00.000Z");
    expect(forro.venue).toBe("Teatro Cerrado");
    expect(forro.evidence.data?.trecho).toBe("sábado, 24 de outubro de 2026");
    expect(forro.sourceRef).toBe(TEATRO.uuid);
    expect(forro.confirmedBySourceId).toBeNull();
  });

  it("página igual não passa de novo pelo modelo (cache por URL e hash)", async () => {
    const first = deps({ sources: [TEATRO] });
    await collectAgenda(first.d);
    const calls = first.fake.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    const r = await collectAgenda(first.d);
    expect(first.fake.calls.length).toBe(calls);
    expect(r.sources[0]).toMatchObject({ aiPages: 0, approved: 2 });
  });

  it("teto por execução: perRun = 2 lê a listagem e 1 página e adia a fonte", async () => {
    const { d, saved, fake } = deps({ aiBudget: { perRun: 2, remainingToday: 160 } });
    const r = await collectAgenda(d);
    const rep = r.sources.find((s) => s.id === "teatro-cerrado")!;
    expect(rep.status).toBe("ia_adiada");
    expect(rep.found).toBe(1);
    expect(rep.aiPages).toBe(2);
    expect(r.aiPages).toBe(2);
    expect(fake.calls.length).toBe(2);
    // A fonte adiada não grava pela metade; as outras gravam.
    expect(saved.some((e) => e.sourceId === "teatro-cerrado")).toBe(false);
    expect(saved.some((e) => e.title === "Cine Praça: sessão ao ar livre")).toBe(true);
  });

  it("perRun = 1: só a listagem vai ao modelo (a chamada da listagem conta no teto)", async () => {
    const { d, fake } = deps({ sources: [TEATRO], aiBudget: { perRun: 1, remainingToday: 160 } });
    const r = await collectAgenda(d);
    expect(r.sources[0]).toMatchObject({ status: "ia_adiada", aiPages: 1, found: 0 });
    expect(fake.calls.length).toBe(1);
  });

  it("teto do dia zerado: a fonte ai_page fica adiada sem chamar o modelo", async () => {
    const { d, fake } = deps({ sources: [TEATRO], aiBudget: { perRun: 40, remainingToday: 0 } });
    const r = await collectAgenda(d);
    expect(r.sources[0]?.status).toBe("ia_adiada");
    expect(fake.calls.length).toBe(0);
  });

  it("prazo: passou de 45 s depois da 1ª página, adia e não grava a fonte pela metade", async () => {
    let t = 0;
    const base = deps();
    let pages = 0;
    const slow: CallAgent = async (agentId, input, schema, opts) => {
      const out = await base.d.callAgent(agentId, input, schema, opts);
      if (input.data.some((x) => x.id === "pagina") && ++pages === 1) t = AI_DEADLINE_MS + 1_000;
      return out;
    };
    const { d, saved } = { ...base, d: { ...base.d, callAgent: slow, monotonic: () => t } };
    const r = await collectAgenda(d);
    const rep = r.sources.find((s) => s.id === "teatro-cerrado")!;
    expect(rep.status).toBe("ia_adiada");
    expect(rep.aiPages).toBe(2);
    expect(saved.some((e) => e.sourceId === "teatro-cerrado")).toBe(false);
    expect(saved.some((e) => e.title === "Sarau da Casa Exemplo")).toBe(true);
  });

  it("prazo duro no meio de uma página: a ai_page fica adiada (a fonte respondeu), estruturadas gravam", async () => {
    const ctrl = new AbortController();
    const base = deps({ sources: [TEATRO, INGRESSOS], signal: ctrl.signal });
    const callAgent: CallAgent = (agentId, input, schema, opts) => {
      if (input.data.some((x) => x.id === "pagina")) ctrl.abort();
      return base.d.callAgent(agentId, input, schema, opts);
    };
    const r = await collectAgenda({ ...base.d, callAgent });
    const rep = r.sources.find((s) => s.id === "teatro-cerrado")!;
    expect(rep.status).toBe("ia_adiada");
    expect(base.states.find((s) => s.uuid === TEATRO.uuid)?.outcome).toBe("ok");
    expect(base.saved.some((e) => e.sourceId === "ingressosmt")).toBe(true);
  });

  it("estruturadas rodam antes das ai_page; relatório na ordem das fontes", async () => {
    const order: string[] = [];
    const { d } = deps({
      sources: [TEATRO, INGRESSOS],
      sourceState: async (uuid) => void order.push(uuid),
    });
    const r = await collectAgenda(d);
    expect(order).toEqual([INGRESSOS.uuid, TEATRO.uuid]);
    expect(r.sources.map((s) => s.id)).toEqual(["teatro-cerrado", "ingressosmt"]);
  });

  it("Sympla e a casa com o mesmo show: 1 evento, a linha da casa", async () => {
    const { d, saved } = deps({ sources: [TEATRO, INGRESSOS] });
    const r = await collectAgenda(d);
    const fest = saved.filter((e) => e.title === "Festival Cerrado Eletrônico");
    expect(fest).toHaveLength(1);
    // A casa confirma por `sources.confirms`; `confirmedBySourceId` é só para outra fonte.
    expect(fest[0]).toMatchObject({
      sourceId: "teatro-cerrado",
      sourceRef: TEATRO.uuid,
      confirmedBySourceId: null,
      startsAt: "2026-11-21T23:00:00.000Z",
    });
    expect(r.duplicates).toBe(1);
    expect(r.sources.find((s) => s.id === "teatro-cerrado")?.confirmed).toBe(1);
  });
});

describe("collectAgenda · eventos já guardados", () => {
  it("evento retirado (withdrawnAt) não é regravado", async () => {
    const { d, saved } = deps({
      sources: [TEATRO],
      stored: async () => [
        storedRow({ dedupeKey: FORRO_KEY, withdrawnAt: "2026-10-02T12:00:00.000Z" }),
      ],
    });
    await collectAgenda(d);
    expect(saved.map((e) => e.title)).toEqual(["Festival Cerrado Eletrônico"]);
  });

  it("campo travado (lockedFields) mantém o valor guardado", async () => {
    const { d, saved } = deps({
      sources: [TEATRO],
      stored: async () => [
        storedRow({
          dedupeKey: FORRO_KEY,
          title: "Forró da Praça (edição da redação)",
          lockedFields: ["title"],
        }),
      ],
    });
    const r = await collectAgenda(d);
    const forro = saved.find((e) => e.dedupeKey === FORRO_KEY)!;
    expect(forro.title).toBe("Forró da Praça (edição da redação)");
    expect(r.sources[0]).toMatchObject({ new: 1, updated: 1 });
  });

  it("casa confirma evento já guardado da Sympla: atualiza a linha guardada, sem segunda linha", async () => {
    const legacyKey = "festival-cerrado-eletronico|2026-11-21|arena-legado";
    const { d, saved } = deps({
      sources: [TEATRO],
      stored: async () => [
        storedRow({
          dedupeKey: legacyKey,
          title: "Festival Cerrado Eletrônico",
          startsAt: "2026-11-21T22:00:00.000Z",
          venue: "Arena Pantanal Fictícia",
          neighborhood: "Verdão",
          priceCents: 8000,
          priceUnknown: false,
          sourceUrl: "https://ingressosmt.example/evento/cerrado-eletronico/1001",
          sourceId: "ingressosmt",
          sourceRef: INGRESSOS.uuid,
          confirms: false,
          confirmedBySourceId: null,
        }),
      ],
    });
    await collectAgenda(d);
    const fest = saved.filter((e) => e.title === "Festival Cerrado Eletrônico");
    expect(fest).toHaveLength(1);
    expect(fest[0]).toMatchObject({
      dedupeKey: legacyKey,
      sourceId: "ingressosmt",
      confirmedBySourceId: TEATRO.uuid,
      startsAt: "2026-11-21T23:00:00.000Z",
      priceCents: 8000,
    });
    expect(fest[0]?.evidence.conflito).toMatchObject({ campo: "horario" });
    expect(fest[0]?.description).toContain("19h");
  });

  it("descoberta igual a evento guardado de fonte que confirma é descartada", async () => {
    const { d, saved } = deps({
      sources: [INGRESSOS],
      stored: async () => [
        storedRow({
          dedupeKey: FESTIVAL_TEATRO_KEY,
          title: "Festival Cerrado Eletrônico",
          startsAt: "2026-11-21T23:00:00.000Z",
          venue: "Arena Pantanal Fictícia",
        }),
      ],
    });
    const r = await collectAgenda(d);
    expect(saved.some((e) => e.title === "Festival Cerrado Eletrônico")).toBe(false);
    expect(r.duplicates).toBe(1);
  });
});

describe("collectAgenda · prazo da execução", () => {
  it("HTTP lento (10 s por pedido): para no corte, termina antes do prazo duro e grava o que terminou", async () => {
    let t = 0;
    const base = crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    });
    const { d, saved, states } = deps({
      monotonic: () => t,
      crawl: {
        ...base,
        http: async (url, init) => {
          t += 10_000;
          return base.http(url, init);
        },
      },
    });
    const r = await collectAgenda(d);
    expect(t).toBeLessThanOrEqual(AI_HARD_DEADLINE_MS);
    const status = Object.fromEntries(r.sources.map((s) => [s.id, s.status]));
    // Estruturadas na ordem: iCal (robots + feed) e JSON-LD terminam; as seguintes, não.
    expect(status).toMatchObject({
      culturavarzea: "ok",
      "cerrado-vivo": "ok",
      agendamt: "adiada",
      ingressosmt: "adiada",
      "eventos-cerrado": "adiada",
      "teatro-cerrado": "ia_adiada",
    });
    expect(saved.some((e) => e.title === "Cine Praça: sessão ao ar livre")).toBe(true);
    expect(saved.some((e) => e.title === "Noite do Siriri Moderno")).toBe(true);
    expect(saved.some((e) => e.sourceId === "agendamt" || e.sourceId === "teatro-cerrado")).toBe(
      false,
    );
    // Adiada não conta falha nem sucesso da fonte.
    expect(states.map((s) => s.uuid)).not.toContain(byId("agendamt").uuid);
  });

  it("prazo duro abortado no meio de um pedido: a fonte fica adiada, sem falha", async () => {
    const ctrl = new AbortController();
    const base = crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    });
    const { d, states } = deps({
      sources: [INGRESSOS],
      signal: ctrl.signal,
      crawl: {
        ...base,
        http: async (url, init) => {
          if (url.endsWith("/robots.txt")) return base.http(url, init);
          ctrl.abort();
          throw new DOMException("aborted", "AbortError");
        },
      },
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]?.status).toBe("adiada");
    expect(states).toEqual([]);
  });
});

describe("collectAgenda · estado da fonte", () => {
  it("HTTP 500 → sourceState(failed); sucesso → ok", async () => {
    const base = crawlDeps({
      repo: { hitRateLimit: async () => true },
      env: { CRAWLER_FIXTURES: "1", NODE_ENV: "test" },
    });
    const broken: AgendaSource = {
      ...INGRESSOS,
      id: "quebrada",
      uuid: "f1000000-0000-4000-8000-0000000000ff",
      url: "https://quebrada.example/eventos",
    };
    const { d, states } = deps({
      sources: [broken, TEATRO],
      crawl: {
        ...base,
        http: async (url, init) =>
          url.includes("quebrada.example") && !url.endsWith("/robots.txt")
            ? new Response("erro", { status: 500 })
            : base.http(url, init),
      },
    });
    const r = await collectAgenda(d);
    expect(r.sources[0]).toMatchObject({ status: "erro", detail: "HTTP 500" });
    expect(states).toEqual([
      { uuid: broken.uuid, outcome: "failed", detail: "HTTP 500" },
      { uuid: TEATRO.uuid, outcome: "ok", detail: undefined },
    ]);
    expect(r.sources.map((s) => s.id)).toEqual(["quebrada", "teatro-cerrado"]);
  });
});
