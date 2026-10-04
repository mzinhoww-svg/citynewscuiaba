import { CLOSE_AFTER_DAYS, nextTopicState, type TopicFacts } from "./state";

const facts = (over: Partial<TopicFacts> = {}): TopicFacts => ({
  state: "em_apuracao",
  independentOutlets: 1,
  hasOfficial: false,
  hasCorrection: false,
  daysSinceLastItem: 0,
  ...over,
});

describe("nextTopicState (A10)", () => {
  it("1 veículo comum continua em apuração", () => {
    expect(nextTopicState(facts())).toBe("em_apuracao");
  });

  it("confirmado com 2 veículos independentes", () => {
    expect(nextTopicState(facts({ independentOutlets: 2 }))).toBe("confirmado");
    expect(nextTopicState(facts({ independentOutlets: 5 }))).toBe("confirmado");
  });

  it("confirmado com 1 fonte oficial", () => {
    expect(nextTopicState(facts({ hasOfficial: true }))).toBe("confirmado");
  });

  it("corrigido ao publicar correção, mesmo confirmado", () => {
    expect(nextTopicState(facts({ state: "confirmado", hasCorrection: true }))).toBe("corrigido");
    expect(nextTopicState(facts({ hasCorrection: true }))).toBe("corrigido");
  });

  it("encerrado depois de 7 dias sem novidade, de qualquer estado", () => {
    expect(CLOSE_AFTER_DAYS).toBe(7);
    for (const state of ["em_apuracao", "confirmado", "corrigido"] as const)
      expect(nextTopicState(facts({ state, daysSinceLastItem: 7 }))).toBe("encerrado");
    expect(nextTopicState(facts({ state: "confirmado", daysSinceLastItem: 6.9 }))).toBe(
      "confirmado",
    );
  });

  it("só avança: confirmado e corrigido não voltam a em apuração", () => {
    expect(nextTopicState(facts({ state: "confirmado", independentOutlets: 1 }))).toBe(
      "confirmado",
    );
    expect(nextTopicState(facts({ state: "corrigido", independentOutlets: 1 }))).toBe("corrigido");
  });

  it("novidade em assunto encerrado o reabre, pelos fatos", () => {
    expect(nextTopicState(facts({ state: "encerrado", daysSinceLastItem: 0 }))).toBe("em_apuracao");
    expect(
      nextTopicState(facts({ state: "encerrado", independentOutlets: 2, daysSinceLastItem: 1 })),
    ).toBe("confirmado");
  });

  it("encerrado sem novidade continua encerrado", () => {
    expect(nextTopicState(facts({ state: "encerrado", daysSinceLastItem: 30 }))).toBe("encerrado");
  });
});
