import { describe, expect, it } from "vitest";
import type { Consent } from "@/lib/consent";
import { createAnonStore, memoryKV } from "./store";
import type { KV } from "./types";

const NONE: Consent = { version: "v1", metrics: false, personalization: false, decided: true };
const PERSO: Consent = { version: "v1", metrics: true, personalization: true, decided: true };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function failingKV(): KV {
  const boom = () => Promise.reject(new DOMException("QuotaExceededError"));
  return { get: boom, set: boom, del: boom };
}

const DAY = 86_400_000;
const NOW = new Date("2026-09-27T12:00:00Z");

describe("perfil anônimo", () => {
  it("sem personalização não cria anonId, mas segue e salva localmente", async () => {
    const s = createAnonStore(memoryKV());
    await s.ensureAnonId(NONE);
    await s.follow("source", "folha-do-cerrado");
    await s.save("article:1");
    const p = await s.get();
    expect(p.anonId).toBeNull();
    expect(p.follows).toHaveLength(1);
    expect(p.saved).toHaveLength(1);
  });

  it("com personalização cria um UUID v4 estável", async () => {
    const s = createAnonStore(memoryKV());
    const id = await s.ensureAnonId(PERSO);
    expect(id).toMatch(UUID_V4);
    expect(await s.ensureAnonId(PERSO)).toBe(id);
    expect((await s.get()).anonId).toBe(id);
  });

  it("sem personalização leitura e busca não ficam guardadas", async () => {
    const s = createAnonStore(memoryKV());
    await s.ensureAnonId(NONE);
    await s.recordRead({ ref: "article:1", seconds: 90, scrollPct: 80 });
    await s.recordSearch("ônibus cpa");
    const p = await s.get();
    expect(p.history).toEqual([]);
    expect(p.searches).toEqual([]);
  });

  it("revogar a personalização apaga anonId e histórico, mantém escolhas explícitas", async () => {
    const s = createAnonStore(memoryKV());
    await s.ensureAnonId(PERSO);
    await s.follow("source", "mt-agora");
    await s.save("article:2");
    await s.hide("placar-mt", "not_interested");
    await s.recordRead({ ref: "article:2", sourceSlug: "mt-agora", seconds: 45, scrollPct: 70 });
    await s.recordSearch("viaduto");
    expect(await s.ensureAnonId(NONE)).toBeNull();
    const p = await s.get();
    expect(p.anonId).toBeNull();
    expect(p.history).toEqual([]);
    expect(p.searches).toEqual([]);
    expect(p.interests).toEqual([]);
    expect(p.follows.map((f) => f.id)).toEqual(["mt-agora"]);
    expect(p.saved.map((x) => x.ref)).toEqual(["article:2"]);
    expect(p.hidden.map((h) => h.sourceSlug)).toEqual(["placar-mt"]);
  });

  it("histórico guarda só 30 dias e 20 buscas", async () => {
    const s = createAnonStore(memoryKV(), { now: () => NOW });
    await s.ensureAnonId(PERSO);
    for (let i = 0; i < 25; i++) await s.recordSearch(`busca ${i}`);
    await s.recordRead({
      ref: "article:velho",
      seconds: 60,
      scrollPct: 90,
      at: new Date(NOW.getTime() - 40 * DAY).toISOString(),
    });
    await s.recordRead({ ref: "article:novo", seconds: 60, scrollPct: 90 });
    const p = await s.get();
    expect(p.searches).toHaveLength(20);
    expect(p.searches[0]).toBe("busca 24");
    expect(p.history.map((h) => h.ref)).toEqual(["article:novo"]);
  });

  it("histórico antigo sai também na leitura", async () => {
    let now = NOW;
    const s = createAnonStore(memoryKV(), { now: () => now });
    await s.ensureAnonId(PERSO);
    await s.recordRead({ ref: "article:1", seconds: 60, scrollPct: 90 });
    now = new Date(NOW.getTime() + 31 * DAY);
    expect((await s.get()).history).toEqual([]);
  });

  it("backend indisponível cai para memória e sinaliza", async () => {
    const s = createAnonStore(failingKV());
    await s.save("article:1");
    expect(s.degraded).toBe(true);
    expect((await s.get()).saved).toHaveLength(1);
  });

  it("seguir, salvar e ocultar não duplicam; desfazer remove", async () => {
    const s = createAnonStore(memoryKV());
    await s.follow("source", "mt-agora");
    await s.follow("source", "mt-agora");
    await s.follow("topic", "mt-agora");
    await s.save("article:1");
    await s.save("article:1");
    await s.hide("mt-agora", "already_know");
    await s.hide("mt-agora", "hide_topic");
    let p = await s.get();
    expect(p.follows).toHaveLength(2);
    expect(p.saved).toHaveLength(1);
    expect(p.hidden).toEqual([
      expect.objectContaining({ sourceSlug: "mt-agora", reason: "hide_topic" }),
    ]);
    await s.unfollow("source", "mt-agora");
    await s.unsave("article:1");
    await s.unhide("mt-agora");
    p = await s.get();
    expect(p.follows.map((f) => f.kind)).toEqual(["topic"]);
    expect(p.saved).toEqual([]);
    expect(p.hidden).toEqual([]);
  });

  it("escritas em paralelo não se perdem", async () => {
    const s = createAnonStore(memoryKV());
    await Promise.all([
      s.follow("source", "a"),
      s.follow("source", "b"),
      s.save("article:1"),
      s.save("article:2"),
    ]);
    const p = await s.get();
    expect(p.follows).toHaveLength(2);
    expect(p.saved).toHaveLength(2);
  });

  it("apagar histórico e redefinir", async () => {
    const s = createAnonStore(memoryKV());
    await s.ensureAnonId(PERSO);
    await s.follow("source", "a");
    await s.recordRead({ ref: "article:1", seconds: 60, scrollPct: 90 });
    await s.recordSearch("x");
    await s.clearHistory();
    let p = await s.get();
    expect(p.history).toEqual([]);
    expect(p.searches).toEqual([]);
    expect(p.follows).toHaveLength(1);
    await s.reset();
    p = await s.get();
    expect(p.follows).toEqual([]);
    expect(p.anonId).toBeNull();
  });

  it("leituras viram interesses com evidência; remover apaga a evidência (P21)", async () => {
    const s = createAnonStore(memoryKV(), { now: () => NOW });
    await s.ensureAnonId(PERSO);
    for (const d of [1, 2, 3]) {
      const at = new Date(NOW.getTime() - d * DAY).toISOString();
      await s.recordRead({
        ref: `article:${d}`,
        section: "cidade",
        seconds: 45,
        scrollPct: 80,
        at,
      });
    }
    await s.recordRead({ ref: "article:9", section: "cultura", seconds: 70, scrollPct: 10 });
    let p = await s.get();
    expect(p.interests).toEqual([
      expect.objectContaining({ key: "Cidade", weak: false, section: "cidade" }),
      expect.objectContaining({ key: "Cultura", weak: true }),
    ]);
    await s.removeInterest("Cidade");
    p = await s.get();
    expect(p.interests.map((i) => i.key)).toEqual(["Cultura"]);
    expect(p.history.map((h) => h.section)).toEqual(["cultura"]);
  });

  it("redefinir recomendações apaga histórico, buscas, interesses e ocultações", async () => {
    const s = createAnonStore(memoryKV());
    await s.ensureAnonId(PERSO);
    await s.follow("source", "a");
    await s.save("article:1");
    await s.hide("b", "not_interested");
    await s.recordRead({ ref: "article:1", section: "cidade", seconds: 60, scrollPct: 90 });
    await s.recordSearch("x");
    await s.resetRecommendations();
    const p = await s.get();
    expect(p.history).toEqual([]);
    expect(p.searches).toEqual([]);
    expect(p.interests).toEqual([]);
    expect(p.hidden).toEqual([]);
    expect(p.follows).toHaveLength(1);
    expect(p.saved).toHaveLength(1);
  });

  it("dado corrompido no navegador vira perfil vazio válido", async () => {
    const kv = memoryKV();
    await kv.set("profile", { anonId: "não-é-uuid", follows: "x", saved: [{ ref: 1 }] });
    const p = await createAnonStore(kv).get();
    expect(p.anonId).toBeNull();
    expect(p.follows).toEqual([]);
    expect(p.saved).toEqual([]);
  });

  it("salvo guarda título e link para Favoritos e progresso de leitura", async () => {
    const s = createAnonStore(memoryKV(), { now: () => NOW });
    await s.save("article:1", 0, {
      title: "Plano de ônibus",
      href: "/materia/x",
      section: "cidade",
    });
    await s.setProgress("article:1", 62.4);
    await s.setProgress("article:nao-salvo", 50);
    const p = await s.get();
    expect(p.saved).toEqual([
      {
        ref: "article:1",
        at: NOW.toISOString(),
        progress: 62.4,
        title: "Plano de ônibus",
        href: "/materia/x",
        section: "cidade",
      },
    ]);
  });

  it("link de salvo só aceita caminho interno", async () => {
    const s = createAnonStore(memoryKV());
    await s.save("article:1", 0, { title: "X", href: "https://mal.example/phish" });
    expect((await s.get()).saved[0]!.href).toBeUndefined();
  });

  it("seguidas com rótulo e reordenação", async () => {
    const s = createAnonStore(memoryKV());
    await s.follow("source", "a");
    await s.follow("source", "b");
    await s.follow("topic", "plano-de-onibus", "Plano de ônibus");
    expect((await s.get()).follows.map((f) => f.id)).toEqual(["plano-de-onibus", "b", "a"]);
    await s.reorderFollows("source", ["a", "b"]);
    const p = await s.get();
    expect(p.follows.filter((f) => f.kind === "source").map((f) => f.id)).toEqual(["a", "b"]);
    expect(p.follows.find((f) => f.kind === "topic")!.label).toBe("Plano de ônibus");
  });

  it("coleções pessoais: criar, renomear e apagar", async () => {
    const s = createAnonStore(memoryKV(), { uuid: () => "c1" });
    await s.createCollection("  Para ler no fim de semana  ");
    await s.renameCollection("c1", "Fim de semana");
    expect((await s.get()).collections).toEqual([
      expect.objectContaining({ id: "c1", name: "Fim de semana", items: [] }),
    ]);
    await s.createCollection("   ");
    expect((await s.get()).collections).toHaveLength(1);
    await s.deleteCollection("c1");
    expect((await s.get()).collections).toEqual([]);
  });

  it("alertas locais: criar e remover, sem conta", async () => {
    const s = createAnonStore(memoryKV(), { uuid: () => "al1", now: () => NOW });
    await s.addAlert({
      kind: "bairro",
      target: "cpa",
      label: "CPA",
      frequency: "immediate",
      channel: "browser",
    });
    expect((await s.get()).alerts).toEqual([
      {
        id: "al1",
        kind: "bairro",
        target: "cpa",
        label: "CPA",
        frequency: "immediate",
        channel: "browser",
        status: "active",
        at: NOW.toISOString(),
      },
    ]);
    await s.removeAlert("al1");
    expect((await s.get()).alerts).toEqual([]);
  });
});
