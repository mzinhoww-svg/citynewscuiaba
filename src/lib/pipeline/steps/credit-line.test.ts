import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { ok } from "@/lib/result";
import { parseBody } from "@/lib/db/queries/articles";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { anySourceTrusted, sourceTrusted } from "@/lib/sources/trusted";
import { createMemoryPublishRepo, type MemoryTopic } from "../testing/memory-publish-repo";
import type { PipelineMessage } from "../types";
import {
  appendCreditLine,
  CREDIT_PREFIX,
  creditSourcesOf,
  creditSourcesOfNode,
  creditText,
  hasCreditLine,
} from "./credit-line";
import { createPublishHandlers } from "./index";
import { DIVERGENCE_RULE, REDACTION_RULES, writeTaskFor } from "./write";

const NOW = new Date("2026-10-03T18:00:00Z");
const SOURCES = {
  "mt-agora": { reliability: "verified", name: "MT Agora" },
  "folha-do-cerrado": { reliability: "standard", name: "Folha do Cerrado" },
} as const;

const msg = (step: PipelineMessage["step"], itemRef: string): PipelineMessage => ({
  runId: "r1",
  step,
  itemRef,
  attempt: 1,
});

function setup() {
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const callAgent = createCallAgent({ store, provider: fake, now: () => NOW });
  const repo = createMemoryPublishRepo(SOURCES, {});
  const handlers = createPublishHandlers({
    repo,
    rules: { activeRules: async () => ok(DEFAULT_RULES) },
    flags: { isEnabled: async () => false },
    callAgent,
    promptVersion: async (id: string) => (await store.agent(id))?.prompt?.version ?? null,
    embed: async () => ok([1, 2, 3, 4]),
    revalidate: async () => undefined,
    now: () => NOW,
  });
  return { repo, fake, handlers };
}

const topic = (items: MemoryTopic["items"], sectionSlug = "seguranca"): MemoryTopic => ({
  id: "t1",
  slug: "operacao-em-cuiaba",
  title: "Operação em Cuiabá",
  sectionSlug,
  confidence: "média",
  confidenceScore: 0.5,
  items,
});

describe("linha de crédito (AUT-T2)", () => {
  const one = [{ name: "MT Agora", url: "https://mtagora.example/a" }];

  it("uma fonte: 'Com informações de X' com link no atributo do parágrafo", () => {
    const doc = appendCreditLine({ type: "doc", content: [{ type: "paragraph" }] }, one);
    const last = doc.content.at(-1);
    expect(hasCreditLine(doc)).toBe(true);
    expect(creditSourcesOfNode(last)).toEqual(one);
    expect(JSON.stringify(last)).toContain("Com informações de MT Agora");
  });

  it("várias fontes: lista com vírgula e 'e'", () => {
    expect(
      creditText([
        { name: "A", url: "https://a.example" },
        { name: "B", url: "https://b.example" },
        { name: "C", url: "https://c.example" },
      ]),
    ).toBe("Com informações de A, B e C");
    expect(creditText(one)).toBe(`${CREDIT_PREFIX} MT Agora`);
  });

  it("idempotente: refazer substitui a linha em vez de duplicar", () => {
    const once = appendCreditLine({ type: "doc", content: [] }, one);
    const twice = appendCreditLine(once, [
      { name: "Folha do Cerrado", url: "https://f.example/x" },
    ]);
    expect(twice.content).toHaveLength(1);
    expect(creditSourcesOfNode(twice.content[0])?.[0]?.name).toBe("Folha do Cerrado");
  });

  it("sem fonte citável não acrescenta nada (o portão de completude barra)", () => {
    const doc = appendCreditLine({ type: "doc", content: [{ type: "paragraph" }] }, []);
    expect(hasCreditLine(doc)).toBe(false);
    expect(creditSourcesOf([{ sourceName: " ", canonicalUrl: "https://x.example" }])).toEqual([]);
    expect(creditSourcesOf([{ sourceName: "X", canonicalUrl: "javascript:alert(1)" }])).toEqual([]);
  });

  it("fontes distintas por nome, na ordem", () => {
    expect(
      creditSourcesOf([
        { sourceName: "MT Agora", canonicalUrl: "https://mtagora.example/1" },
        { sourceName: "mt agora", canonicalUrl: "https://mtagora.example/2" },
        { sourceName: "Folha", canonicalUrl: "https://folha.example/1" },
      ]),
    ).toHaveLength(2);
  });

  it("o corpo salvo vira bloco de crédito na leitura pública", () => {
    const doc = appendCreditLine(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lide." }] }] },
      one,
    );
    const blocks = parseBody(doc);
    expect(blocks.at(-1)).toEqual({
      type: "credit",
      text: "Com informações de MT Agora",
      sources: one,
    });
    expect(ARTICLE.creditPrefix).toBe(CREDIT_PREFIX);
  });
});

describe("write: atribuição e regras de redação", () => {
  const items = [
    {
      id: "i1",
      sourceSlug: "mt-agora",
      title: "Polícia prende suspeito de roubo em Cuiabá",
      excerpt: "A prisão ocorreu no bairro Goiabeiras, segundo a Polícia Militar.",
      sensitive: true,
    },
  ];

  it("matéria de 1 fonte termina com 'Com informações de X' com link", async () => {
    const { repo, handlers } = setup();
    repo.addTopic(topic(items));
    await handlers.summarize!(msg("summarize", "topic:t1"));
    const a = repo.articleOfTopic("t1")!;
    const body = a.input.body as { content: unknown[] };
    const last = body.content.at(-1);
    expect(creditSourcesOfNode(last)).toEqual([
      { name: "MT Agora", url: "https://mt-agora.example/i1" },
    ]);
    expect(parseBody(a.input.body).at(-1)).toMatchObject({ type: "credit" });
  });

  it("o prompt de segurança, política e saúde traz as regras de redação; cidade comum não", async () => {
    for (const section of ["seguranca", "politica", "saude"]) {
      expect(writeTaskFor(section)).toContain(REDACTION_RULES);
      const { repo, handlers, fake } = setup();
      repo.addTopic(topic(items, section));
      await handlers.summarize!(msg("summarize", "topic:t1"));
      expect(fake.calls.find((c) => c.agentId === "write")?.prompt).toMatch(
        /presunção de inocência/,
      );
    }
    expect(writeTaskFor("cidade")).not.toContain(REDACTION_RULES);
    expect(writeTaskFor("cidade", true)).toContain(REDACTION_RULES);
    expect(REDACTION_RULES).toMatch(/menor de idade/);
    expect(REDACTION_RULES).toMatch(/suicídio/);
    expect(REDACTION_RULES).toMatch(/orientação clínica/);
    expect(writeTaskFor("cidade")).toMatch(/segundo \{fonte\}/);
  });
});

describe("fonte confiável", () => {
  it("coluna trusted decide; sem ela vale o padrão por confiabilidade", () => {
    expect(sourceTrusted({ trusted: true, reliability: "low" })).toBe(true);
    expect(sourceTrusted({ trusted: false, reliability: "primary" })).toBe(false);
    expect(sourceTrusted({ reliability: "primary" })).toBe(true);
    expect(sourceTrusted({ reliability: "verified" })).toBe(true);
    expect(sourceTrusted({ reliability: "standard" })).toBe(false);
    expect(anySourceTrusted([{ reliability: "low" }, { trusted: true, reliability: "low" }])).toBe(
      true,
    );
  });

  it("o contexto de decisão expõe sourceTrusted pelo cadastro da fonte", async () => {
    const { repo, handlers } = setup();
    repo.addTopic(
      topic([
        { id: "i1", sourceSlug: "folha-do-cerrado", title: "Prefeitura abre obra na avenida" },
        { id: "i2", sourceSlug: "mt-agora", title: "Obra na avenida começa", trusted: true },
      ]),
    );
    await handlers.summarize!(msg("summarize", "topic:t1"));
    const ctx = await repo.decisionContext(repo.articleOfTopic("t1")!.id);
    expect(ctx?.sourceTrusted).toBe(true);
  });
});

describe("divergência entre fontes no texto (D-05)", () => {
  it("com conflito confirmado, o redator atribui cada versão e marca o preliminar", () => {
    expect(writeTaskFor("cidade", false, true)).toContain(DIVERGENCE_RULE);
    expect(DIVERGENCE_RULE).toMatch(/cada versão/);
    expect(DIVERGENCE_RULE).toMatch(/preliminar/);
    expect(writeTaskFor("cidade")).not.toContain(DIVERGENCE_RULE);
  });
});
