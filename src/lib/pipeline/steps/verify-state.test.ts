import { describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import {
  createMemoryUnderstandRepo,
  type MemoryItemInput,
} from "../testing/memory-understand-repo";
import type { PipelineMessage } from "../types";
import { createUnderstandHandlers } from "./index";

/*
 * AUT-T7 (A10): a verificação do assunto também atualiza `topics.state`: confirmado com 2 veículos
 * independentes ou 1 fonte oficial; só avança; encerrado reabre com novidade.
 */

const NOW = new Date("2026-10-03T18:00:00Z");
const SOURCES = {
  "diario-oficial-de-cuiaba": { reliability: "primary", locality: "cuiaba" },
  "mt-agora": { reliability: "verified", locality: "mt" },
  "folha-do-cerrado": { reliability: "verified", locality: "cuiaba" },
} as const;

const verifyMsg: PipelineMessage = {
  runId: "run-1",
  step: "verify",
  itemRef: "topic:t1",
  attempt: 1,
};

function setup() {
  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const callAgent = createCallAgent({ store, provider: fake, now: () => NOW });
  const repo = createMemoryUnderstandRepo(SOURCES);
  const promptVersion = async (id: string) => (await store.agent(id))?.prompt?.version ?? null;
  const handlers = createUnderstandHandlers({ repo, callAgent, promptVersion, now: () => NOW });
  return { repo, handlers };
}

const item = (slug: keyof typeof SOURCES, id: string): MemoryItemInput => ({
  id,
  sourceSlug: slug,
  title: `Prefeitura abre obra na avenida do CPA (${id})`,
  excerpt: "A obra começa na segunda-feira.",
  publishedAt: "2026-10-03T12:00:00Z",
  topicId: "t1",
  sectionSlug: "cidade",
});

describe("estado do assunto na verificação", () => {
  it("1 veículo comum: continua em apuração", async () => {
    const { repo, handlers } = setup();
    repo.add(item("mt-agora", "a1"));
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("em_apuracao");
  });

  it("2 veículos independentes: confirmado", async () => {
    const { repo, handlers } = setup();
    repo.add(item("mt-agora", "a1"));
    repo.add(item("folha-do-cerrado", "a2"));
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("confirmado");
  });

  it("2 itens do mesmo veículo não confirmam", async () => {
    const { repo, handlers } = setup();
    repo.add(item("mt-agora", "a1"));
    repo.add(item("mt-agora", "a2"));
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("em_apuracao");
  });

  it("1 fonte oficial: confirmado", async () => {
    const { repo, handlers } = setup();
    repo.add(item("diario-oficial-de-cuiaba", "a1"));
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("confirmado");
  });

  it("confirmado e corrigido não voltam a em apuração", async () => {
    const { repo, handlers } = setup();
    repo.add(item("mt-agora", "a1"));
    repo.setTopicState("t1", "corrigido");
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("corrigido");
  });

  it("novidade em assunto encerrado o reabre", async () => {
    const { repo, handlers } = setup();
    repo.add(item("mt-agora", "a1"));
    repo.setTopicState("t1", "encerrado");
    await handlers.verify!(verifyMsg);
    expect(repo.topic("t1")?.state).toBe("em_apuracao");
  });
});
