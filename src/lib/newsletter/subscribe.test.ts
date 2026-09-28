import { vi } from "vitest";
import { subscribeNewsletter, type SubscribeDeps } from "./subscribe";

function deps(over: Partial<SubscribeDeps> = {}): SubscribeDeps {
  return {
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({ ok: true as const, value: { alreadyActive: [] as string[] } })),
    queue: vi.fn(async () => ({ ok: true as const, value: undefined })),
    link: vi.fn(
      (email: string, lists: string[], confirm: boolean) =>
        `https://citynews.test/newsletter/preferencias?token=${email}:${lists.join(",")}${confirm ? "&confirmar=1" : ""}`,
    ),
    ...over,
  };
}

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

it("e-mail inválido volta com erro e exemplo, sem gravar", async () => {
  const d = deps();
  const r = await subscribeNewsletter(form({ email: "nao-e-email" }), d);
  expect(r.status).toBe("invalid");
  expect(r.message).toMatch(/Exemplo:/);
  expect(r.email).toBe("nao-e-email");
  expect(d.save).not.toHaveBeenCalled();
});

it("honeypot preenchido finge sucesso e não grava", async () => {
  const d = deps();
  const r = await subscribeNewsletter(form({ email: "a@exemplo.com", website: "spam" }), d);
  expect(r.status).toBe("success");
  expect(d.save).not.toHaveBeenCalled();
  expect(d.allow).not.toHaveBeenCalled();
});

it("acima do limite recusa com mensagem clara", async () => {
  const d = deps({ allow: vi.fn(async () => ({ ok: true as const, value: false })) });
  const r = await subscribeNewsletter(form({ email: "a@exemplo.com" }), d);
  expect(r.status).toBe("rate_limited");
  expect(d.save).not.toHaveBeenCalled();
});

it("sem lista escolhida vale a diária (formulário da home); grava normalizado e pede confirmação", async () => {
  const d = deps();
  const r = await subscribeNewsletter(form({ email: "  Ana@Exemplo.com " }), d);
  expect(r.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith("ana@exemplo.com", ["diaria"]);
  expect(d.queue).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "newsletter_confirm",
      to: "ana@exemplo.com",
      body: expect.stringContaining("&confirmar=1"),
      ref: "lists:diaria",
    }),
  );
});

it("dedupe por lista: outra lista gera outra referência (gate P2, I4)", async () => {
  const d = deps();
  await subscribeNewsletter(
    form({ email: "a@exemplo.com", lists: ["politica-semana", "agenda-fds"] }),
    d,
  );
  expect(d.queue).toHaveBeenCalledWith(
    expect.objectContaining({ ref: "lists:agenda-fds,politica-semana" }),
  );
});

it("várias listas: só ids conhecidos; lista desconhecida é ignorada; nenhuma válida é inválido", async () => {
  const d = deps();
  await subscribeNewsletter(
    form({ email: "a@exemplo.com", lists: ["agenda-fds", "xyz", "politica-semana"] }),
    d,
  );
  expect(d.save).toHaveBeenCalledWith("a@exemplo.com", ["agenda-fds", "politica-semana"]);
  const r = await subscribeNewsletter(
    form({ email: "a@exemplo.com", lists: ["xyz"], picked: "1" }),
    d,
  );
  expect(r.status).toBe("invalid");
  const none = await subscribeNewsletter(form({ email: "a@exemplo.com", picked: "1" }), d);
  expect(none.status).toBe("invalid");
  expect(none.message).toMatch(/ao menos uma/);
});

it("já inscrito e confirmado em tudo: avisa e manda o link de preferências", async () => {
  const d = deps({
    save: vi.fn(async () => ({ ok: true as const, value: { alreadyActive: ["diaria"] } })),
  });
  const r = await subscribeNewsletter(form({ email: "a@exemplo.com", lists: "diaria" }), d);
  expect(r.status).toBe("already");
  expect(d.queue).toHaveBeenCalledWith(expect.objectContaining({ kind: "newsletter_manage" }));
});

it("banco indisponível vira erro amigável", async () => {
  const d = deps({
    save: vi.fn(async () => ({ ok: false as const, error: { kind: "unavailable" as const } })),
  });
  const r = await subscribeNewsletter(form({ email: "a@exemplo.com" }), d);
  expect(r.status).toBe("error");
  expect(r.email).toBe("a@exemplo.com");
});
