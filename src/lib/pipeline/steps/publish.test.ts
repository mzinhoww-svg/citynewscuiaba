import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { err, ok, type Result } from "@/lib/result";
import type { RuleSet } from "@/lib/rules";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { drain } from "../drain";
import type { FlagKey } from "../ports";
import { createRunStep } from "../run-step";
import { WRITE_AI_RETRIES } from "./write";
import { createMemoryPublishRepo, type MemoryTopic } from "../testing/memory-publish-repo";
import { createMemoryQueue } from "../testing/memory-queue";
import type { PipelineMessage } from "../types";
import { unpublishAuto } from "../unpublish";
import { createPublishHandlers } from "./index";

const NOW = new Date("2026-09-27T18:00:00Z");
const SOURCES = {
  "agencia-mt": { reliability: "primary", name: "Agência Cerrado (governo fictício)" },
  "mt-agora": { reliability: "verified", name: "MT Agora" },
  "folha-do-cerrado": { reliability: "verified", name: "Folha do Cerrado" },
} as const;
const OPEN: RuleSet = { ...DEFAULT_RULES, version: 2, forceReview: false };
const OTAVIO = {
  id: "c1000000-0000-4000-8000-000000000003",
  roles: [{ role: "editor" as const, sections: ["cidade", "servicos", "clima", "agenda"] }],
};

function farmacias(over: Partial<MemoryTopic> = {}): MemoryTopic {
  return {
    id: "t-farm",
    slug: "farmacias-de-plantao",
    title: "Farmácias de plantão no fim de semana",
    sectionSlug: "servicos",
    confidence: "média",
    confidenceScore: 0.6,
    items: [
      {
        id: "i1",
        sourceSlug: "mt-agora",
        title: "Farmácias de plantão atendem no fim de semana em Cuiabá",
        excerpt: "A lista inclui 12 unidades.",
      },
      {
        id: "i2",
        sourceSlug: "folha-do-cerrado",
        title: "Confira as farmácias de plantão do fim de semana",
        excerpt: "São 12 unidades abertas.",
      },
    ],
    ...over,
  };
}

function setup(
  opts: {
    rules?: () => Promise<Result<RuleSet, string>>;
    flags?: Partial<Record<FlagKey, boolean>>;
    embedFails?: boolean;
  } = {},
) {
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const callAgent = createCallAgent({ store, provider: fake, now: () => NOW });
  const repo = createMemoryPublishRepo(SOURCES, { clima: "clima" });
  const flags: Partial<Record<FlagKey, boolean>> = { auto_publish: false, ...opts.flags };
  const revalidated: string[] = [];
  const deps = {
    repo,
    rules: { activeRules: opts.rules ?? (async () => ok(DEFAULT_RULES)) },
    flags: { isEnabled: async (k: FlagKey) => flags[k] ?? false },
    callAgent,
    promptVersion: async (id: string) => (await store.agent(id))?.prompt?.version ?? null,
    embed: async (t: string) =>
      opts.embedFails ? err("provider") : ok(Array.from({ length: 4 }, (_, i) => t.length + i)),
    revalidate: async (tags: string[]) => void revalidated.push(...tags),
    now: () => NOW,
  };
  const handlers = createPublishHandlers(deps);
  return { repo, fake, store, handlers, deps, revalidated };
}

const msg = (step: PipelineMessage["step"], itemRef: string, attempt = 1): PipelineMessage => ({
  runId: "r1",
  step,
  itemRef,
  attempt,
});
/** Última tentativa da redação: depois de `WRITE_AI_RETRIES` novas tentativas, vale o rascunho sem IA. */
const LAST = WRITE_AI_RETRIES + 1;

async function unwrap(p: Promise<Result<PipelineMessage[], unknown>>) {
  const r = await p;
  if (!r.ok) throw new Error(`esperava sucesso: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("write (etapas 11 e 12)", () => {
  it("rascunho com citações vira matéria em rascunho e segue para a imagem", async () => {
    const { repo, handlers, fake } = setup();
    repo.addTopic(farmacias());
    const next = await unwrap(handlers.summarize!(msg("summarize", "topic:t-farm")));
    const a = repo.articleOfTopic("t-farm")!;
    expect(next).toEqual([msg("image", `article:${a.id}`)]);
    expect(a).toMatchObject({ status: "draft", version: 1 });
    expect(a.input).toMatchObject({ aiFallback: false, sectionSlug: "servicos" });
    expect(a.input.aiSummary?.length).toBeGreaterThan(0);
    const body = a.input.body as { content: { attrs: { citations: string[] } }[] };
    expect(body.content.every((p) => p.attrs.citations.length > 0)).toBe(true);
    expect(repo.decisions()[0]).toMatchObject({
      objectRef: "topic:t-farm",
      step: "summarize",
      agentId: "write",
      promptVersion: 1,
    });
    // Mesma revisão: não chama o modelo de novo.
    await handlers.summarize!(msg("summarize", "topic:t-farm"));
    expect(fake.calls.filter((c) => c.agentId === "write")).toHaveLength(1);
  });

  it("modelo principal fora: fallback escreve normalmente", async () => {
    const { repo, handlers, fake, store } = setup();
    repo.addTopic(farmacias());
    fake.script([{ error: "provider" }]);
    await unwrap(handlers.summarize!(msg("summarize", "topic:t-farm")));
    expect(repo.articleOfTopic("t-farm")!.input.aiFallback).toBe(false);
    expect(store.calls.at(-1)).toMatchObject({ fallback_used: true, ok: true });
  });

  it("Review Focus 4: principal e fallback fora → revisão humana com motivo, nada se perde", async () => {
    const { repo, handlers, fake } = setup();
    repo.addTopic(farmacias());
    fake.script([{ error: "timeout" }, { error: "provider" }]);
    const next = await unwrap(handlers.summarize!(msg("summarize", "topic:t-farm", LAST)));
    const a = repo.articleOfTopic("t-farm")!;
    expect(a.status).toBe("in_review");
    expect(a.input.aiFallback).toBe(true);
    expect(a.reviewReason).toMatch(/IA indisponível/);
    expect(a.input.aiSummary).toBeNull();
    expect(a.input.sources.map((s) => s.itemId)).toEqual(["i1", "i2"]);
    expect(repo.decisions()[0]!.rationale).toMatch(/IA indisponível.*\(provider\)/);
    expect(next).toEqual([msg("image", `article:${a.id}`)]);
  });

  it("IA fora nas primeiras tentativas: erro transitório (nova tentativa), nada vai para a fila humana", async () => {
    for (const error of ["timeout", "provider", "schema"] as const) {
      const { repo, handlers, fake } = setup();
      repo.addTopic(farmacias());
      fake.script([{ error }, { error }]);
      const r = await handlers.summarize!(msg("summarize", "topic:t-farm", 1));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ kind: "transient", retryable: true });
      expect(repo.articleOfTopic("t-farm")).toBeUndefined();
      expect(repo.decisions()).toHaveLength(0);
    }
  });

  it("texto sem citação válida antes da última tentativa também tenta de novo", async () => {
    const { repo, handlers, fake } = setup();
    repo.addTopic(farmacias());
    fake.script([
      {
        output: {
          title: "Farmácias de plantão abertas",
          dek: "Lista oficial do fim de semana",
          summary: ["Doze farmácias abrem."],
          body: [{ text: "Doze farmácias abrem.", citations: ["inventado"] }],
        },
      },
    ]);
    const r = await handlers.summarize!(msg("summarize", "topic:t-farm", 1));
    expect(r.ok).toBe(false);
    expect(repo.articleOfTopic("t-farm")).toBeUndefined();
  });

  it("orçamento esgotado ou IA desligada: nova tentativa não ajuda, vale o rascunho sem IA na hora", async () => {
    for (const error of ["budget_exceeded", "disabled"] as const) {
      const s = setup();
      s.repo.addTopic(farmacias());
      const handlers = createPublishHandlers({ ...s.deps, callAgent: async () => err(error) });
      await unwrap(handlers.summarize!(msg("summarize", "topic:t-farm", 1)));
      expect(s.repo.articleOfTopic("t-farm")).toMatchObject({ status: "in_review" });
      expect(s.repo.articleOfTopic("t-farm")!.input.aiFallback).toBe(true);
    }
  });

  it("texto sem citação válida também vai para revisão", async () => {
    const { repo, handlers, fake } = setup();
    repo.addTopic(farmacias());
    fake.script([
      {
        output: {
          title: "Farmácias de plantão abertas",
          dek: "Lista oficial do fim de semana",
          summary: ["Doze farmácias abrem."],
          body: [{ text: "Doze farmácias abrem.", citations: ["inventado"] }],
        },
      },
    ]);
    await handlers.summarize!(msg("summarize", "topic:t-farm", LAST));
    expect(repo.articleOfTopic("t-farm")).toMatchObject({ status: "in_review" });
    expect(repo.articleOfTopic("t-farm")!.reviewReason).toMatch(/sem citações válidas/);
  });

  it("matéria editada por pessoa nunca é reescrita", async () => {
    const { repo, handlers, fake } = setup();
    repo.addTopic(farmacias());
    await handlers.summarize!(msg("summarize", "topic:t-farm"));
    const a = repo.articleOfTopic("t-farm")!;
    repo.markHumanEdited(a.id);
    repo.addTopic(
      farmacias({
        items: [
          ...farmacias().items,
          { id: "i3", sourceSlug: "agencia-mt", title: "Governo divulga a lista de farmácias" },
        ],
      }),
    );
    const next = await unwrap(handlers.summarize!(msg("summarize", "topic:t-farm")));
    expect(next).toEqual([msg("notify", `article:${a.id}#new_sources`)]);
    expect(repo.article(a.id)!.version).toBe(1);
    expect(fake.calls.filter((c) => c.agentId === "write")).toHaveLength(1);
  });
});

describe("reescrita de matéria no ar (A-126)", () => {
  async function live(s: ReturnType<typeof setup>) {
    s.repo.addTopic(farmacias());
    await s.handlers.summarize!(msg("summarize", "topic:t-farm"));
    const a = s.repo.articleOfTopic("t-farm")!;
    await s.repo.setStatus(a.id, { status: "published", publishMode: "auto" });
    return a.id;
  }

  it("#rewrite em publicada automática atualiza o texto sem tirar do ar e segue até o índice", async () => {
    const s = setup({ flags: { auto_publish: true } });
    const id = await live(s);
    const next = await unwrap(s.handlers.summarize!(msg("summarize", "topic:t-farm#rewrite5")));
    expect(next).toEqual([msg("image", `article:${id}`)]);
    expect(s.repo.article(id)).toMatchObject({
      status: "published",
      publishMode: "auto",
      version: 2,
    });
    // Regras não decidem de novo o que já está no ar: seguem para publicar, que reindexa.
    expect(await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)))).toEqual([
      msg("publish", `article:${id}`),
    ]);
    expect(await unwrap(s.handlers.publish!(msg("publish", `article:${id}`)))).toEqual([
      msg("index", `article:${id}`),
    ]);
  });

  it("sem #rewrite, a publicada não é reescrita (só aviso de fontes novas)", async () => {
    const s = setup();
    const id = await live(s);
    const next = await unwrap(s.handlers.summarize!(msg("summarize", "topic:t-farm")));
    expect(next).toEqual([msg("notify", `article:${id}#new_sources`)]);
    expect(s.repo.article(id)!.version).toBe(1);
  });

  it("#rewrite com a IA fora não troca o texto que está no ar", async () => {
    const s = setup();
    const id = await live(s);
    s.fake.script([{ error: "timeout" }, { error: "provider" }]);
    const next = await unwrap(
      s.handlers.summarize!(msg("summarize", "topic:t-farm#rewrite5", LAST)),
    );
    expect(next).toEqual([]);
    expect(s.repo.article(id)).toMatchObject({ status: "published", version: 1 });
  });

  it("#rewrite com a IA fora antes da última tentativa: tenta de novo, texto no ar intacto", async () => {
    const s = setup();
    const id = await live(s);
    s.fake.script([{ error: "timeout" }, { error: "provider" }]);
    const r = await s.handlers.summarize!(msg("summarize", "topic:t-farm#rewrite5", 1));
    expect(r.ok).toBe(false);
    expect(s.repo.article(id)).toMatchObject({ status: "published", version: 1 });
  });

  it("#rewrite em publicada editada por pessoa: nunca", async () => {
    const s = setup();
    const id = await live(s);
    s.repo.markHumanEdited(id);
    const next = await unwrap(s.handlers.summarize!(msg("summarize", "topic:t-farm#rewrite5")));
    expect(next).toEqual([msg("notify", `article:${id}#new_sources`)]);
    expect(s.repo.article(id)!.version).toBe(1);
  });
});

async function drafted(s: ReturnType<typeof setup>, topic: MemoryTopic = farmacias(), attempt = 1) {
  s.repo.addTopic(topic);
  await s.handlers.summarize!(msg("summarize", `topic:${topic.id}`, attempt));
  return s.repo.articleOfTopic(topic.id)!.id;
}

describe("regras, rota e publicação (etapas 15 a 18)", () => {
  it("forceReview (regras v1): revisão com regra, justificativa, versão e confiança", async () => {
    const s = setup({ flags: { auto_publish: true } });
    const id = await drafted(s);
    const next = await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)));
    expect(next).toEqual([msg("notify", `article:${id}#review`)]);
    expect(s.repo.article(id)).toMatchObject({ status: "in_review", rulesVersion: 1 });
    expect(s.repo.decisions().at(-1)).toMatchObject({
      step: "rules",
      rulesVersion: 1,
      recommended: "review",
      rationale: expect.stringMatching(/Revisão obrigatória/),
      output: expect.objectContaining({
        route: "review",
        rule: "force_review",
        confidence: { level: "média", score: 0.6 },
      }),
    });
  });

  it("nenhuma regra ativa ou erro ao carregar: forceReview (falha fechada)", async () => {
    for (const rules of [
      async () => err("nenhuma regra ativa"),
      async (): Promise<Result<RuleSet, string>> => {
        throw new Error("banco fora");
      },
    ]) {
      const s = setup({ rules, flags: { auto_publish: true } });
      const id = await drafted(s);
      await s.handlers.rules!(msg("rules", `article:${id}`));
      expect(s.repo.article(id)!.status).toBe("in_review");
      expect(s.repo.decisions().at(-1)).toMatchObject({
        rulesVersion: null,
        output: expect.objectContaining({ rule: "rules_unavailable", route: "review" }),
      });
    }
  });

  it("forceReview=false e auto_publish: Serviços com 2 fontes publica, com decisão e índice", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id = await drafted(s);
    expect(await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)))).toEqual([
      msg("publish", `article:${id}`),
    ]);
    const next = await unwrap(s.handlers.publish!(msg("publish", `article:${id}`)));
    expect(next).toEqual([
      msg("index", `article:${id}`),
      msg("notify", `article:${id}#auto_published`),
    ]);
    expect(s.repo.article(id)).toMatchObject({
      status: "published",
      publishMode: "auto",
      publishedAt: NOW.toISOString(),
      rulesVersion: 2,
    });
    expect(s.repo.decisions().at(-1)).toMatchObject({
      step: "publish",
      rulesVersion: 2,
      rationale: expect.stringMatching(/modo automático/),
      output: expect.objectContaining({
        published: true,
        rule: "mode",
        confidence: { level: "média", score: 0.6 },
      }),
    });
    await s.handlers.index!(msg("index", `article:${id}`));
    expect(s.repo.article(id)!.indexed?.embedding).toHaveLength(4);
    expect(s.revalidated).toEqual(
      expect.arrayContaining([`article:${id}`, "topic:t-farm", "section:servicos", "home"]),
    );
    // Reexecutar a publicação é inofensivo.
    expect(await unwrap(s.handlers.publish!(msg("publish", `article:${id}`)))).toEqual([
      msg("index", `article:${id}`),
    ]);
  });

  it("grava a decisão antes de mudar o status (queda no meio não deixa publicação sem decisão)", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id = await drafted(s);
    await s.handlers.rules!(msg("rules", `article:${id}`));
    const order: string[] = [];
    const setStatus = s.repo.setStatus.bind(s.repo);
    const recordDecision = s.repo.recordDecision.bind(s.repo);
    s.repo.setStatus = async (a, p) => {
      order.push(`status:${p.status}`);
      return setStatus(a, p);
    };
    s.repo.recordDecision = async (d) => {
      order.push(`decision:${d.step}`);
      return recordDecision(d);
    };
    await unwrap(s.handlers.publish!(msg("publish", `article:${id}`)));
    expect(order).toEqual(["decision:publish", "status:published"]);

    const b = setup({ flags: { auto_publish: false } });
    const idB = await drafted(b);
    await b.handlers.rules!(msg("rules", `article:${idB}`));
    const orderB: string[] = [];
    const setB = b.repo.setStatus.bind(b.repo);
    const recB = b.repo.recordDecision.bind(b.repo);
    b.repo.setStatus = async (a, p) => {
      orderB.push(`status:${p.status}`);
      return setB(a, p);
    };
    b.repo.recordDecision = async (d) => {
      orderB.push(`decision:${d.step}`);
      return recB(d);
    };
    await unwrap(b.handlers.publish!(msg("publish", `article:${idB}`)));
    expect(orderB).toEqual(["decision:publish", "status:in_review"]);
  });

  it("flag auto_publish desligada ou modo leitura: revisão", async () => {
    for (const flags of [{ auto_publish: false }, { auto_publish: true, read_only: true }]) {
      const s = setup({ rules: async () => ok(OPEN), flags });
      const id = await drafted(s);
      await s.handlers.rules!(msg("rules", `article:${id}`));
      expect(s.repo.article(id)!.status).toBe("in_review");
      expect(s.repo.decisions().at(-1)!.output).toMatchObject({
        rule: "auto_publish_off",
        recommended: "publish",
      });
    }
  });

  it("Segurança nunca publica sozinha: retida em rascunho, plantão avisado", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id = await drafted(
      s,
      farmacias({ id: "t-seg", slug: "perseguicao", sectionSlug: "seguranca" }),
    );
    const next = await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)));
    expect(next).toEqual([msg("notify", `article:${id}#hold`)]);
    expect(s.repo.article(id)!.status).toBe("draft");
    await s.handlers.notify!(next[0]!);
    expect(s.repo.notifications().map((n) => n.channel)).toEqual([
      "control_center",
      "oncall_email",
    ]);
  });

  it("breaking (etiqueta urgente ou matéria urgente) nunca publica sozinho", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const topic = farmacias();
    topic.items[0]!.tags = ["urgente"];
    const id = await drafted(s, topic);
    const next = await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)));
    expect(next).toEqual([msg("notify", `article:${id}#breaking`)]);
    expect(s.repo.decisions().at(-1)!.output).toMatchObject({ rule: "breaking" });
  });

  it("publish recusa decisão forjada para Segurança, urgente ou revisão desatualizada", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id = await drafted(s);
    await s.handlers.rules!(msg("rules", `article:${id}`));
    s.repo.setUrgent(id);
    const next = await unwrap(s.handlers.publish!(msg("publish", `article:${id}`)));
    expect(next).toEqual([msg("notify", `article:${id}#review`)]);
    expect(s.repo.article(id)).toMatchObject({ status: "in_review", publishMode: null });

    const s2 = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id2 = await drafted(s2);
    await s2.handlers.rules!(msg("rules", `article:${id2}`));
    s2.repo.addTopic(farmacias({ confidenceScore: 0.6 }));
    await s2.repo.saveDraft({ ...s2.repo.article(id2)!.input });
    await s2.handlers.publish!(msg("publish", `article:${id2}`));
    expect(s2.repo.article(id2)!.status).toBe("in_review");
    expect(s2.repo.decisions().at(-1)!.rationale).toMatch(/desatualizada/);
  });

  it("rascunho sem IA nunca publica, mesmo com regras abertas", async () => {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    s.fake.script([{ error: "provider" }, { error: "provider" }]);
    const id = await drafted(s, farmacias(), LAST);
    const next = await unwrap(s.handlers.rules!(msg("rules", `article:${id}`)));
    expect(next).toEqual([msg("notify", `article:${id}#ai_unavailable`)]);
    expect(s.repo.decisions().at(-1)!.output).toMatchObject({ rule: "ai_unavailable" });
  });

  it("índice sem embedding (IA fora) indexa o texto mesmo assim", async () => {
    const s = setup({
      rules: async () => ok(OPEN),
      flags: { auto_publish: true },
      embedFails: true,
    });
    const id = await drafted(s);
    await s.handlers.rules!(msg("rules", `article:${id}`));
    await s.handlers.publish!(msg("publish", `article:${id}`));
    await s.handlers.index!(msg("index", `article:${id}`));
    expect(s.repo.article(id)!.indexed).toEqual({ embedding: null });
  });
});

describe("notify (etapa 20)", () => {
  it("dedupe de 10 min por tipo; e-mail do plantão só na fila", async () => {
    const s = setup();
    const a = await drafted(s);
    const b = await drafted(s, farmacias({ id: "t-2", slug: "outro" }));
    await s.handlers.notify!(msg("notify", `article:${a}#review`));
    await s.handlers.notify!(msg("notify", `article:${b}#review`));
    expect(s.repo.notifications()).toHaveLength(1);
    s.repo.advance(11 * 60_000);
    await s.handlers.notify!(msg("notify", `article:${b}#review`));
    expect(s.repo.notifications()).toHaveLength(2);
    await s.handlers.notify!(msg("notify", `article:${a}#auto_published_notify`));
    expect(s.repo.notifications().at(-1)).toMatchObject({
      channel: "oncall_email",
      kind: "auto_published_notify",
    });
  });

  it("referência desconhecida vai para a quarentena", async () => {
    const s = setup();
    const r = await s.handlers.notify!(msg("notify", "article:x#qualquer"));
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: "invalid" }) });
  });
});

describe("unpublishAuto (desfazer em um clique)", () => {
  async function published() {
    const s = setup({ rules: async () => ok(OPEN), flags: { auto_publish: true } });
    const id = await drafted(s);
    await s.handlers.rules!(msg("rules", `article:${id}`));
    await s.handlers.publish!(msg("publish", `article:${id}`));
    return { s, id };
  }

  it("editor da editoria despublica com motivo; decisão humana, auditoria e cache", async () => {
    const { s, id } = await published();
    const r = await unpublishAuto(s.deps, id, OTAVIO, "Lista de farmácias desatualizada");
    expect(r).toEqual({ ok: true, value: { articleId: id, status: "unpublished" } });
    expect(s.repo.article(id)).toMatchObject({
      status: "unpublished",
      reviewReason: "Lista de farmácias desatualizada",
    });
    expect(s.repo.decisions().at(-1)).toMatchObject({
      step: "publish",
      humanDecision: "unpublish",
      humanId: OTAVIO.id,
      rulesVersion: 2,
    });
    expect(s.repo.audits()).toEqual([
      expect.objectContaining({ action: "article.unpublish_auto", objectRef: `article:${id}` }),
    ]);
    expect(s.revalidated).toContain(`article:${id}`);
  });

  it("recusa sem motivo, sem permissão, fora da editoria ou matéria humana", async () => {
    const { s, id } = await published();
    expect(await unpublishAuto(s.deps, id, OTAVIO, "  ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    const jornalista = { id: "j", roles: [{ role: "jornalista" as const, sections: [] }] };
    expect(await unpublishAuto(s.deps, id, jornalista, "x")).toEqual({
      ok: false,
      error: "forbidden",
    });
    const outraEditoria = { id: "e", roles: [{ role: "editor" as const, sections: ["cultura"] }] };
    expect((await unpublishAuto(s.deps, id, outraEditoria, "x")).ok).toBe(false);
    expect(await unpublishAuto(s.deps, "nada", OTAVIO, "x")).toEqual({
      ok: false,
      error: "not_found",
    });
    const s2 = setup();
    const draft = await drafted(s2);
    expect(await unpublishAuto(s2.deps, draft, OTAVIO, "x")).toEqual({
      ok: false,
      error: "not_auto",
    });
  });
});

describe("cadeia no worker (Review Focus 4)", () => {
  it("IA fora durante write: tenta de novo com espera e, na última, revisão com motivo e notificação", async () => {
    const s = setup({ flags: { auto_publish: true } });
    s.repo.addTopic(farmacias());
    // Cada tentativa chama o modelo principal e o reserva: 2 falhas por tentativa.
    s.fake.script(Array.from({ length: 2 * LAST }, () => ({ error: "provider" as const })));
    let clock = 0;
    const queue = createMemoryQueue(() => clock);
    await queue.enqueue("pipeline", msg("summarize", "topic:t-farm"));
    const runStep = createRunStep({
      ...s.handlers,
      image: async (m) => ok([{ ...m, step: "rules" }]),
    });
    let retried = 0;
    for (let i = 0; i < LAST; i++) {
      const r = await drain({ queue, runStep, events: { record: async () => {} }, now: () => 0 });
      retried += r.retried;
      expect(r.quarantined).toBe(0);
      // Antes da última tentativa nada vai para a fila humana.
      if (i < LAST - 1) expect(s.repo.articleOfTopic("t-farm")).toBeUndefined();
      clock += 10 * 60_000;
    }
    expect(retried).toBe(WRITE_AI_RETRIES);
    expect(await queue.pending("pipeline")).toBe(0);
    const a = s.repo.articleOfTopic("t-farm")!;
    expect(a.status).toBe("in_review");
    expect(s.repo.notifications()).toEqual([
      expect.objectContaining({ kind: "ai_unavailable", channel: "control_center" }),
      expect.objectContaining({ kind: "ai_unavailable", channel: "oncall_email" }),
    ]);
  });
});
