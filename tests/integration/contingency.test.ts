// @vitest-environment node
// P5-T10 · Contingência (plano P5, Review Focus 4; spec §8 e §9). Rodam como usuários de seed
// (JWT real, RLS e triggers valendo). As flags são restauradas no fim: este arquivo é o único
// que mexe em auto_publish, read_only e ai_enabled durante a suíte de integração.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as askRoute } from "@/app/api/ask/route";
import { createCampaignAction } from "@/app/estudio/admin/publicidade/actions";
import { saveTeam } from "@/lib/admin/teams";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createAiStore } from "@/lib/db/ai-store";
import { createFlags } from "@/lib/db/pipeline-store";
import { getHomeData } from "@/lib/db/queries";
import { getFlag, readOnlyNotice, resetFlagCache, setFlag } from "@/lib/flags";
import { createPublishHandlers } from "@/lib/pipeline/steps";
import {
  createMemoryPublishRepo,
  type MemoryTopic,
} from "@/lib/pipeline/testing/memory-publish-repo";
import type { PipelineMessage } from "@/lib/pipeline/types";
import { err, ok } from "@/lib/result";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { answerQuestion } from "@/lib/search/ask";
import { asUser, SEED_USERS, service } from "./studio";

const KEYS = ["auto_publish", "read_only", "ai_enabled"] as const;
const before = new Map<string, boolean>();
const admin = { userId: SEED_USERS.helena.id, roles: [{ role: "admin" as const, sections: [] }] };

const put = async (key: string, enabled: boolean) => {
  await service.from("feature_flags").update({ enabled }).eq("key", key);
  resetFlagCache();
};

beforeAll(async () => {
  const r = await service
    .from("feature_flags")
    .select("key, enabled")
    .in("key", [...KEYS]);
  for (const f of r.data ?? []) before.set(f.key, f.enabled);
});
afterAll(async () => {
  for (const [key, enabled] of before)
    await service.from("feature_flags").update({ enabled, updated_by: null }).eq("key", key);
  resetFlagCache();
});
beforeEach(async () => {
  for (const [key, enabled] of before) await put(key, enabled);
  await put("read_only", false);
});

/* ------------------------------------------------------------------ pipeline */

const NOW = new Date("2026-09-27T18:00:00Z");
const SOURCES = {
  "mt-agora": { reliability: "verified", name: "MT Agora" },
  "folha-do-cerrado": { reliability: "verified", name: "Folha do Cerrado" },
} as const;
const OPEN = { ...DEFAULT_RULES, version: 2, forceReview: false };

const topic = (n: number): MemoryTopic => ({
  id: `t-${n}`,
  slug: `farmacias-${n}`,
  title: `Farmácias de plantão ${n}`,
  sectionSlug: "servicos",
  confidence: "média",
  confidenceScore: 0.6,
  items: [
    {
      id: `a${n}`,
      sourceSlug: "mt-agora",
      title: `Farmácias atendem no plantão ${n}`,
      excerpt: "12 unidades.",
    },
    {
      id: `b${n}`,
      sourceSlug: "folha-do-cerrado",
      title: `Confira as farmácias ${n}`,
      excerpt: "12 abertas.",
    },
  ],
});

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: "r-cont",
  step,
  itemRef,
  attempt: 1,
});

function cycle(aiFromDb = false) {
  const store = createMemoryAiStore();
  if (aiFromDb) store.aiEnabled = () => createAiStore(service).aiEnabled();
  const fake = createFakeProvider();
  const repo = createMemoryPublishRepo(SOURCES, { clima: "clima" });
  const handlers = createPublishHandlers({
    repo,
    rules: { activeRules: async () => ok(OPEN) },
    // Flags reais do banco, lidas a cada item, sem cache (como em produção).
    flags: createFlags(service),
    callAgent: createCallAgent({ store, provider: fake, now: () => NOW }),
    promptVersion: async (id) => (await store.agent(id))?.prompt?.version ?? null,
    embed: async (t) =>
      t ? ok(Array.from({ length: 4 }, (_, i) => t.length + i)) : err("provider"),
    revalidate: async () => {},
    now: () => NOW,
  });
  return { repo, fake, handlers };
}

async function drafted(c: ReturnType<typeof cycle>, n: number) {
  c.repo.addTopic(topic(n));
  await c.handlers.summarize!(msg("summarize", `topic:t-${n}`));
  return c.repo.articleOfTopic(`t-${n}`)!.id;
}

describe("auto_publish no meio de um ciclo (Review Focus 4)", () => {
  it("itens decididos antes seguem; os restantes do ciclo vão para revisão", async () => {
    await put("auto_publish", true);
    const c = cycle();
    const [a, b, d] = [await drafted(c, 1), await drafted(c, 2), await drafted(c, 3)];

    // Item 1 decidido com a publicação automática ligada: as regras liberam.
    const first = await c.handlers.rules!(msg("rules", `article:${a}`));
    expect(first).toEqual({ ok: true, value: [msg("publish", `article:${a}`)] });
    // Item 3 já foi decidido para publicar e está na fila da etapa `publish`.
    await c.handlers.rules!(msg("rules", `article:${d}`));

    // Admin pausa no meio do ciclo, pelo caminho do painel.
    const paused = await asUser("helena", () => setFlag("auto_publish", false, admin, "incidente"));
    expect(paused).toEqual({
      ok: true,
      value: { key: "auto_publish", value: false, previous: true },
    });

    // Item 2 ainda não tinha sido decidido: vai para revisão com a regra auto_publish_off.
    const second = await c.handlers.rules!(msg("rules", `article:${b}`));
    expect(second).toEqual({ ok: true, value: [msg("notify", `article:${b}#review`)] });
    expect(c.repo.article(b)!.status).toBe("in_review");
    expect(c.repo.decisions().at(-1)!.output).toMatchObject({
      rule: "auto_publish_off",
      recommended: "publish",
      flags: { autoPublish: false },
    });
    // Item 3 estava decidido, mas o publish reconfere a flag e devolve para revisão.
    await c.handlers.publish!(msg("publish", `article:${d}`));
    expect(c.repo.article(d)).toMatchObject({ status: "in_review", publishMode: null });
    // Nada ficou publicado depois da pausa.
    expect([b, d].map((id) => c.repo.article(id)!.status)).toEqual(["in_review", "in_review"]);
  });

  it("segurança e urgente nunca publicam sozinhos, nem com a flag ligada", async () => {
    await put("auto_publish", true);
    const c = cycle();
    const t = topic(4);
    t.items[0]!.tags = ["urgente"];
    c.repo.addTopic(t);
    await c.handlers.summarize!(msg("summarize", "topic:t-4"));
    const id = c.repo.articleOfTopic("t-4")!.id;
    const r = await c.handlers.rules!(msg("rules", `article:${id}`));
    expect(r).toEqual({ ok: true, value: [msg("notify", `article:${id}#breaking`)] });
  });
});

/* ------------------------------------------------------------------ modo leitura */

describe("read_only bloqueia a escrita do Estúdio", () => {
  it("Server Actions de domínio recusam com mensagem clara e nada é gravado", async () => {
    await put("read_only", true);
    const teams = () => service.from("teams").select("id", { count: "exact", head: true });
    const n = (await teams()).count;
    const r = await asUser("helena", () => saveTeam({ name: "Equipe em modo leitura" }));
    expect(r).toMatchObject({
      ok: false,
      error: "read_only",
      message: expect.stringMatching(/modo leitura/),
    });
    expect((await teams()).count).toBe(n);
  });

  it("Server Actions da Administração voltam à tela com o aviso e não gravam", async () => {
    await put("read_only", true);
    const form = new FormData();
    form.set("advertiser", "Anunciante Fictício");
    form.set("startsOn", "2026-10-01");
    form.set("endsOn", "2026-10-31");
    form.append("sections", "cidade");
    form.set("headline", "Peça de teste");
    form.set("url", "https://exemplo.com/anuncio");
    const before = (
      await service.from("sponsored_campaigns").select("id", { count: "exact", head: true })
    ).count;
    await expect(asUser("helena", () => createCampaignAction(form))).rejects.toMatchObject({
      digest: expect.stringContaining("erro=read_only"),
    });
    expect(
      (await service.from("sponsored_campaigns").select("id", { count: "exact", head: true }))
        .count,
    ).toBe(before);
  });

  it("o portal público segue lendo; a tela de contingência pode desligar o modo", async () => {
    await put("read_only", true);
    const home = await getHomeData();
    expect(home.ok).toBe(true);
    expect(await readOnlyNotice()).toMatch(/modo leitura/);
    // setFlag não passa pelo portão: é assim que o modo leitura é desligado.
    const off = await asUser("helena", () =>
      setFlag("read_only", false, admin, "incidente resolvido"),
    );
    expect(off.ok).toBe(true);
    expect(await readOnlyNotice()).toBeNull();
    const back = await asUser("helena", () => saveTeam({ name: `Equipe liberada ${Date.now()}` }));
    expect(back.ok).toBe(true);
    if (back.ok) await service.from("teams").delete().eq("id", back.value.id);
  });

  it("pipeline com read_only: nada publica sozinho", async () => {
    await put("auto_publish", true);
    await put("read_only", true);
    const c = cycle();
    const id = await drafted(c, 5);
    await c.handlers.rules!(msg("rules", `article:${id}`));
    expect(c.repo.article(id)!.status).toBe("in_review");
  });
});

/* ------------------------------------------------------------------ IA fora do ar */

describe("ai_enabled = false", () => {
  it("/pergunte (answerQuestion) e /api/ask dizem indisponível, sem 5xx e sem login", async () => {
    await put("ai_enabled", false);
    const out = await answerQuestion("O que aconteceu em Cuiabá hoje?");
    expect(out).toMatchObject({ aiOff: true, answer: { kind: "error", reason: "unavailable" } });

    const res = await askRoute(
      new Request("http://localhost/api/ask?q=farm%C3%A1cias+de+plant%C3%A3o"),
    );
    expect(res.status).toBe(200);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.at(-1)).toMatchObject({
      type: "answer",
      aiOff: true,
      answer: { kind: "error", reason: "unavailable" },
    });
  });

  it("nenhum modelo é chamado e o rascunho sem IA vai para revisão, sem publicar", async () => {
    await put("auto_publish", true);
    await put("ai_enabled", false);
    const c = cycle(true);
    const id = await drafted(c, 6);
    expect(c.fake.calls).toHaveLength(0);
    const a = c.repo.article(id)!;
    expect(a.status).toBe("in_review");
    expect(a.input.aiFallback).toBe(true);
    expect(a.reviewReason).toMatch(/IA indisponível/);
    const r = await c.handlers.rules!(msg("rules", `article:${id}`));
    expect(r).toEqual({ ok: true, value: [msg("notify", `article:${id}#ai_unavailable`)] });
    expect(c.repo.article(id)!.status).toBe("in_review");
  });
});

/* ------------------------------------------------------------------ setFlag */

describe("setFlag", () => {
  const audits = async (action: string, ref: string) =>
    (
      await service
        .from("audit_log")
        .select("actor, details")
        .eq("action", action)
        .eq("object_ref", ref)
        .order("id", { ascending: false })
        .limit(1)
    ).data?.[0];

  it("admin muda a chave, grava quem e quando e audita ator e valor", async () => {
    const r = await asUser("helena", () =>
      setFlag("ai_enabled", false, admin, "custo fora do controle"),
    );
    expect(r).toEqual({ ok: true, value: { key: "ai_enabled", value: false, previous: true } });
    const row = await service
      .from("feature_flags")
      .select("enabled, updated_by")
      .eq("key", "ai_enabled")
      .single();
    expect(row.data).toEqual({ enabled: false, updated_by: SEED_USERS.helena.id });
    expect(await getFlag("ai_enabled")).toBe(false);
    const log = await audits("flag.set", "flag:ai_enabled");
    expect(log?.actor).toBe(SEED_USERS.helena.id);
    expect(log?.details).toMatchObject({
      value: false,
      previous: true,
      reason: "custo fora do controle",
    });
  });

  it("quem não é admin é recusado, com registro, e a chave não muda", async () => {
    for (const who of ["marina", "diego", "otavio"] as const) {
      const roles =
        who === "marina"
          ? [{ role: "editor_chefe" as const, sections: [] }]
          : who === "diego"
            ? [{ role: "operador_ia" as const, sections: [] }]
            : [{ role: "editor" as const, sections: ["cidade"] }];
      const r = await asUser(who, () =>
        setFlag("auto_publish", true, { userId: SEED_USERS[who].id, roles }),
      );
      expect(r).toEqual({ ok: false, error: "forbidden" });
    }
    const row = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(row.data?.enabled).toBe(before.get("auto_publish"));
    expect((await audits("flag.set.denied", "flag:auto_publish"))?.actor).toBe(
      SEED_USERS.otavio.id,
    );
  });

  it("admin declarado sem ser admin no banco: a RLS também barra", async () => {
    const fake = { userId: SEED_USERS.marina.id, roles: admin.roles };
    const r = await asUser("marina", () => setFlag("auto_publish", true, fake));
    expect(r).toEqual({ ok: false, error: "unavailable" });
    const row = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(row.data?.enabled).toBe(before.get("auto_publish"));
  });

  it("chave fora da lista e salvaguardas de segurança não passam por flag", async () => {
    expect(await asUser("helena", () => setFlag("qualquer_coisa", true, admin))).toEqual({
      ok: false,
      error: "invalid_key",
    });
    for (const key of ["safety_never_auto", "force_review", "never_auto_politica"]) {
      const r = await asUser("helena", () => setFlag(key, false, admin));
      expect(r).toEqual({ ok: false, error: "approval_required" });
    }
    const all = await service.from("feature_flags").select("key");
    expect((all.data ?? []).map((f) => f.key).sort()).toEqual(
      [
        "ai_enabled",
        "auto_publish",
        "image_reproduction_enabled",
        "personalization_enabled",
        "read_only",
        "source_link_analysis",
        "sponsored_enabled",
      ].sort(),
    );
    // O banco também mantém a lista fechada.
    const bad = await service
      .from("feature_flags")
      .insert({ key: "safety_never_auto", enabled: false });
    expect(bad.error).not.toBeNull();
  });

  it("leitura: cache curto, falha fechada para segurança", async () => {
    await put("auto_publish", true);
    expect(await getFlag("auto_publish")).toBe(true);
    // Mudança direta no banco não aparece dentro da janela do cache...
    await service.from("feature_flags").update({ enabled: false }).eq("key", "auto_publish");
    expect(await getFlag("auto_publish")).toBe(true);
    // ...mas a leitura "fresh" (portões de escrita) e o reset enxergam.
    expect(await getFlag("auto_publish", { fresh: true })).toBe(false);
  });
});
