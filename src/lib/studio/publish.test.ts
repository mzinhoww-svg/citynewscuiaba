import { parseCuiabaDateTime, planPublication } from "./plan";

const NOW = new Date("2026-09-28T12:00:00Z"); // 8h em Cuiabá

it("horário passado é recusado com mensagem", () => {
  expect(
    planPublication({ when: { at: "2026-09-28T07:30" }, destinations: ["home"] }, NOW),
  ).toEqual({ ok: false, error: "Escolha um horário futuro" });
  expect(
    planPublication({ when: { at: "2026-09-27T20:00:00-04:00" }, destinations: [] }, NOW),
  ).toEqual({ ok: false, error: "Escolha um horário futuro" });
});

it("publicar agora: publicada, modo humano, data de agora", () => {
  expect(planPublication({ when: "now", destinations: ["home", "section"] }, NOW)).toEqual({
    ok: true,
    value: {
      status: "published",
      publishMode: "human",
      publishedAt: NOW.toISOString(),
      scheduledFor: null,
      destinations: ["home", "section"],
    },
  });
});

it("agendar: horário local de Cuiabá vira instante UTC e status agendada", () => {
  const r = planPublication(
    { when: { at: "2026-09-29T07:00" }, destinations: ["section", "newsletter", "section"] },
    NOW,
  );
  expect(r).toEqual({
    ok: true,
    value: {
      status: "scheduled",
      publishMode: "human",
      publishedAt: null,
      scheduledFor: "2026-09-29T11:00:00.000Z",
      destinations: ["section", "newsletter"],
    },
  });
});

it("data inválida e agendamento longe demais são recusados", () => {
  expect(planPublication({ when: { at: "amanhã cedo" }, destinations: [] }, NOW)).toEqual({
    ok: false,
    error: "Data ou hora inválida",
  });
  expect(planPublication({ when: { at: "2027-12-01T08:00" }, destinations: [] }, NOW)).toEqual({
    ok: false,
    error: "Agende para no máximo 90 dias",
  });
});

it("lê data e hora de Cuiabá com e sem fuso", () => {
  expect(parseCuiabaDateTime("2026-10-03T20:00")?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  expect(parseCuiabaDateTime("2026-10-03T20:00:00Z")?.toISOString()).toBe(
    "2026-10-03T20:00:00.000Z",
  );
  expect(parseCuiabaDateTime("x")).toBeNull();
});
