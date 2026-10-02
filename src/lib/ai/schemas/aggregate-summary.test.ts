import { AggregateSummarySchema, copiedRun, sentencesOf } from "./aggregate-summary";

const excerpt =
  "A nova linha expressa terá intervalo de 12 minutos nos horários de pico. Nos fins de semana, o intervalo será de 25 minutos.";

describe("resumo próprio do agregado", () => {
  it("aceita até 2 frases e até 280 caracteres", () => {
    expect(
      AggregateSummarySchema.safeParse({
        summary:
          "Ônibus expresso entre CPA e Centro sai a cada 12 minutos no pico. Aos sábados e domingos, a espera sobe.",
      }).success,
    ).toBe(true);
    expect(
      AggregateSummarySchema.safeParse({
        summary: "Uma frase. Outra frase aqui. E mais uma terceira.",
      }).success,
    ).toBe(false);
    expect(AggregateSummarySchema.safeParse({ summary: "x".repeat(281) }).success).toBe(false);
    expect(AggregateSummarySchema.safeParse({ summary: "curto" }).success).toBe(false);
  });

  it("conta frases por pontuação final", () => {
    expect(sentencesOf("Primeira. Segunda! Terceira?")).toHaveLength(3);
    expect(sentencesOf("Sem ponto final")).toEqual(["Sem ponto final"]);
    expect(sentencesOf("R$ 12,5 mi no pico.")).toHaveLength(1);
  });

  it("frase que repete 8 palavras seguidas da fonte é cópia (sem acento e caixa)", () => {
    expect(
      copiedRun("Segundo o veículo, a NOVA linha expressa terá intervalo de 12 minutos.", excerpt),
    ).toBe("a nova linha expressa tera intervalo de 12");
    expect(
      copiedRun(
        "Linha expressa do CPA ao Centro passa a cada 12 minutos no horário de pico.",
        excerpt,
      ),
    ).toBeNull();
  });

  it("7 palavras seguidas ainda não é cópia", () => {
    expect(copiedRun("Diz que a nova linha expressa terá intervalo curto.", excerpt)).toBeNull();
  });
});
