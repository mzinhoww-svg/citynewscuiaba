import { vi } from "vitest";
import { subscribeNewsletter, type SubscribeDeps } from "./subscribe";

function deps(over: Partial<SubscribeDeps> = {}): SubscribeDeps {
  return {
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({ ok: true as const, value: undefined })),
    ...over,
  };
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
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

it("grava e-mail normalizado na lista diária", async () => {
  const d = deps();
  const r = await subscribeNewsletter(form({ email: "  Ana@Exemplo.com " }), d);
  expect(r.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith("ana@exemplo.com", "diaria");
});

it("banco indisponível vira erro amigável", async () => {
  const d = deps({
    save: vi.fn(async () => ({ ok: false as const, error: { kind: "unavailable" as const } })),
  });
  const r = await subscribeNewsletter(form({ email: "a@exemplo.com" }), d);
  expect(r.status).toBe("error");
  expect(r.email).toBe("a@exemplo.com");
});
