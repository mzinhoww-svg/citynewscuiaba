import { vi } from "vitest";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { reportProblem, type ReportDeps } from "./report";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function deps(over: Partial<ReportDeps> = {}): ReportDeps {
  return {
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({ ok: true as const, value: undefined })),
    ...over,
  };
}

const valid = { contentRef: "article:c2000000-0000-4000-8000-000000000005", kind: "wrong_info" };

it("grava denúncia válida sem login", async () => {
  const d = deps();
  const r = await reportProblem(form({ ...valid, message: " número errado " }), d);
  expect(r.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith({
    contentRef: valid.contentRef,
    kind: "wrong_info",
    message: "número errado",
    contactEmail: null,
  });
});

it("tipo ausente ou desconhecido é inválido e não grava", async () => {
  const d = deps();
  expect((await reportProblem(form({ contentRef: valid.contentRef }), d)).status).toBe("invalid");
  expect((await reportProblem(form({ ...valid, kind: "spam" }), d)).status).toBe("invalid");
  expect(
    (await reportProblem(form({ ...valid, contentRef: "javascript:alert(1)" }), d)).status,
  ).toBe("invalid");
  expect(d.save).not.toHaveBeenCalled();
});

it("e-mail de contato inválido volta com exemplo", async () => {
  const r = await reportProblem(form({ ...valid, contact: "nao-e-email" }), deps());
  expect(r.status).toBe("invalid");
  expect(r.message).toMatch(/Exemplo:/);
});

it("honeypot finge sucesso", async () => {
  const d = deps();
  expect((await reportProblem(form({ ...valid, website: "x" }), d)).status).toBe("success");
  expect(d.save).not.toHaveBeenCalled();
});

it("6ª denúncia na mesma hora é recusada com mensagem clara", async () => {
  const d = deps({
    allow: async () => ({ ok: true, value: await checkRateLimit("report:ip-1", 5, 3600, 500) }),
  });
  for (let i = 0; i < 5; i++) expect((await reportProblem(form(valid), d)).status).toBe("success");
  const sixth = await reportProblem(form(valid), d);
  expect(sixth.status).toBe("rate_limited");
  expect(sixth.message).toMatch(/limite de 5 envios por hora/);
});

it("banco fora vira erro amigável", async () => {
  const d = deps({ save: async () => ({ ok: false, error: { kind: "unavailable" } }) });
  expect((await reportProblem(form(valid), d)).status).toBe("error");
});

it("link quebrado de item agregado (P15) é aceito sem login", async () => {
  const d = deps();
  const ref = "aggregated:c3000000-0000-4000-8000-000000000013";
  const r = await reportProblem(form({ contentRef: ref, kind: "broken_link" }), d);
  expect(r.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith({
    contentRef: ref,
    kind: "broken_link",
    message: null,
    contactEmail: null,
  });
});
