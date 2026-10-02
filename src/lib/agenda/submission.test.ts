import { vi } from "vitest";
import { parseLocalDateTime, submitEvent, type SubmitDeps } from "./submission";

const now = new Date("2026-09-27T18:00:00Z");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function deps(over: Partial<SubmitDeps> = {}): SubmitDeps {
  return {
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({ ok: true as const, value: undefined })),
    now: () => now,
    ...over,
  };
}

const valid = {
  title: "Feira de discos",
  startsAt: "2026-10-10T19:00",
  endsAt: "2026-10-11T01:00",
  venue: "Sesc Arsenal",
  neighborhood: "centro-sul",
  price: "",
  free: "1",
  ageRating: "livre",
  link: "https://feira.example/discos",
  description: "Vinis e fitas de colecionadores de Cuiabá.",
  email: "org@exemplo.com",
  consent: "1",
};

it("hora local de Cuiabá vira instante UTC", () => {
  expect(parseLocalDateTime("2026-10-10T19:00")?.toISOString()).toBe("2026-10-10T23:00:00.000Z");
  expect(parseLocalDateTime("2026-10-10 19h")).toBeNull();
});

it("sugestão válida entra na fila com evento normalizado", async () => {
  const d = deps();
  const r = await submitEvent(form(valid), d);
  expect(r.status).toBe("success");
  expect(d.save).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Feira de discos",
      startsAt: "2026-10-10T23:00:00.000Z",
      endsAt: "2026-10-11T05:00:00.000Z",
      priceCents: null,
      contactEmail: "org@exemplo.com",
    }),
  );
});

it("só o nome: pede a data de início com exemplo e preserva o que foi digitado", async () => {
  const d = deps();
  const r = await submitEvent(form({ title: "Feira de discos" }), d);
  expect(r.status).toBe("invalid");
  expect(r.errors.startsAt).toMatch(/Informe a data de início/);
  expect(r.errors.startsAt).toMatch(/Exemplo:/);
  expect(r.errors.venue).toBeTruthy();
  expect(r.errors.email).toBeTruthy();
  expect(r.errors.consent).toBeTruthy();
  expect(r.values.title).toBe("Feira de discos");
  expect(d.save).not.toHaveBeenCalled();
});

it("recusa fim antes do início, data passada, preço inválido e link sem https", async () => {
  const r = await submitEvent(
    form({ ...valid, endsAt: "2026-10-10T18:00", free: "", price: "abc", link: "javascript:x" }),
    deps(),
  );
  expect(Object.keys(r.errors).sort()).toEqual(["endsAt", "link", "price"]);
  const past = await submitEvent(
    form({ ...valid, startsAt: "2026-09-01T10:00", endsAt: "" }),
    deps(),
  );
  expect(past.errors.startsAt).toMatch(/já passou/);
});

it("preço em reais vira centavos", async () => {
  const d = deps();
  await submitEvent(form({ ...valid, free: "", price: "30,50" }), d);
  expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ priceCents: 3050 }));
});

it("descrição acima de 500 caracteres é recusada", async () => {
  const r = await submitEvent(form({ ...valid, description: "a".repeat(501) }), deps());
  expect(r.errors.description).toMatch(/500/);
});

it("honeypot finge sucesso sem gravar; limite recusa com mensagem clara", async () => {
  const d = deps();
  expect((await submitEvent(form({ ...valid, website: "x" }), d)).status).toBe("success");
  expect(d.save).not.toHaveBeenCalled();
  const limited = await submitEvent(
    form(valid),
    deps({ allow: async () => ({ ok: true, value: false }) }),
  );
  expect(limited.status).toBe("rate_limited");
  expect(limited.message).toMatch(/limite de 5 envios por hora/);
});
