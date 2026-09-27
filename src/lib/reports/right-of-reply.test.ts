import { vi } from "vitest";
import { articleSlugFromUrl, requestRightOfReply, type ReplyDeps } from "./right-of-reply";

const ID = "c2000000-0000-4000-8000-000000000001";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function deps(over: Partial<ReplyDeps> = {}): ReplyDeps {
  return {
    findArticle: vi.fn(async () => ({ ok: true as const, value: ID })),
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({ ok: true as const, value: undefined })),
    ...over,
  };
}

const valid = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  article: "https://citynews.example/materia/o-que-muda-nas-linhas-de-onibus-entre-cpa-e-centro",
  reply: "A associação de moradores não foi ouvida e discorda do horário informado na matéria.",
  consent: "1",
};

it("extrai o slug do link completo ou do caminho", () => {
  expect(articleSlugFromUrl("https://x.example/materia/plano-de-onibus?utm=1")).toBe(
    "plano-de-onibus",
  );
  expect(articleSlugFromUrl("/materia/plano-de-onibus/historico")).toBe("plano-de-onibus");
  expect(articleSlugFromUrl("https://x.example/agenda/feira")).toBeNull();
  expect(articleSlugFromUrl("não é link")).toBeNull();
});

it("grava pedido ligado à matéria, sem login", async () => {
  const d = deps();
  const s = await requestRightOfReply(form(valid), d);
  expect(s.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith(
    expect.objectContaining({
      contentRef: `article:${ID}`,
      kind: "right_of_reply",
      contactEmail: "ana@exemplo.com",
      message: expect.stringContaining("Ana Souza"),
    }),
  );
});

it("erro por campo com exemplo e devolve o que foi digitado", async () => {
  const s = await requestRightOfReply(form({ ...valid, email: "ana", reply: "curto" }), deps());
  expect(s.status).toBe("invalid");
  expect(s.errors.email).toMatch(/Exemplo/);
  expect(s.errors.reply).toMatch(/Exemplo|pelo menos/);
  expect(s.values.name).toBe("Ana Souza");
});

it("matéria que não existe é recusada com exemplo", async () => {
  const d = deps({ findArticle: vi.fn(async () => ({ ok: true as const, value: null })) });
  const s = await requestRightOfReply(form(valid), d);
  expect(s.status).toBe("invalid");
  expect(s.errors.article).toMatch(/Exemplo/);
  expect(d.save).not.toHaveBeenCalled();
});

it("6º pedido na hora é recusado com mensagem clara", async () => {
  const s = await requestRightOfReply(
    form(valid),
    deps({ allow: vi.fn(async () => ({ ok: true as const, value: false })) }),
  );
  expect(s.status).toBe("rate_limited");
  expect(s.message).toMatch(/uma hora/);
});

it("campo-armadilha preenchido finge sucesso e não grava", async () => {
  const d = deps();
  const s = await requestRightOfReply(form({ ...valid, website: "spam" }), d);
  expect(s.status).toBe("success");
  expect(d.save).not.toHaveBeenCalled();
});
