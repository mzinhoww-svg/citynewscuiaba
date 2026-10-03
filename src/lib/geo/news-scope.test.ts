import { describe, expect, it } from "vitest";
import { asScope, isEligibleForFeature, mostLocal, newsScope } from "./news-scope";

const base = {
  neighborhoods: [] as string[],
  municipality: null,
  sourceLocality: "nacional" as const,
  text: "",
};

describe("newsScope (AUT-T3)", () => {
  it("bairro de Cuiabá → cuiaba, mesmo em fonte nacional", () =>
    expect(newsScope({ ...base, neighborhoods: ["Goiabeiras"], text: "Obra na avenida" })).toBe(
      "cuiaba",
    ));

  it("bairro de Várzea Grande também é a região metropolitana", () =>
    expect(newsScope({ ...base, neighborhoods: ["Cristo Rei"] })).toBe("cuiaba"));

  it("município de MT fora da capital → mt", () => {
    expect(newsScope({ ...base, municipality: "mt", text: "Safra em Sorriso" })).toBe("mt");
    expect(newsScope({ ...base, text: "Prefeitura de Rondonópolis abre licitação" })).toBe("mt");
    expect(newsScope({ ...base, text: "Governo de Mato Grosso anuncia obra" })).toBe("mt");
  });

  it("matéria de Brasília de fonte nacional → national", () =>
    expect(
      newsScope({
        ...base,
        text: "Congresso aprova reforma em Brasília",
        sourceLocality: "nacional",
      }),
    ).toBe("national"));

  it("fonte nacional que cita Cuiabá no texto vira cuiaba", () =>
    expect(newsScope({ ...base, text: "Ministro visita Cuiabá nesta sexta" })).toBe("cuiaba"));

  it("fonte local sem lugar no texto mantém a localidade da fonte", () => {
    expect(newsScope({ ...base, sourceLocality: "cuiaba", text: "Chuva forte à tarde" })).toBe(
      "cuiaba",
    );
    expect(newsScope({ ...base, sourceLocality: "mt", text: "Chuva forte à tarde" })).toBe("mt");
  });

  it("'nacional' do localizador sem lugar local no texto não é salvo pela fonte local", () =>
    expect(
      newsScope({
        ...base,
        municipality: "nacional",
        sourceLocality: "cuiaba",
        text: "Seleção estreia na Copa",
      }),
    ).toBe("national"));

  it("'br' vale o mesmo que nacional", () =>
    expect(newsScope({ ...base, sourceLocality: "br", text: "Dólar fecha em alta" })).toBe(
      "national",
    ));
});

describe("isEligibleForFeature e auxiliares", () => {
  it("local e regional sempre; nacional só com comoção", () => {
    expect(isEligibleForFeature({ newsScope: "cuiaba", nationalCommotion: false })).toBe(true);
    expect(isEligibleForFeature({ newsScope: "mt", nationalCommotion: false })).toBe(true);
    expect(isEligibleForFeature({ newsScope: "national", nationalCommotion: false })).toBe(false);
    expect(isEligibleForFeature({ newsScope: "national", nationalCommotion: true })).toBe(true);
    expect(isEligibleForFeature({ newsScope: null, nationalCommotion: false })).toBe(true);
  });
  it("mostLocal escolhe o mais local; asScope limpa valor desconhecido", () => {
    expect(mostLocal(["nacional", "mt", "varzea-grande"])).toBe("cuiaba");
    expect(mostLocal(["nacional", "mt"])).toBe("mt");
    expect(mostLocal(["nacional"])).toBe("nacional");
    expect(mostLocal([])).toBeNull();
    expect(asScope("mt")).toBe("mt");
    expect(asScope("outro")).toBeNull();
    expect(asScope(null)).toBeNull();
  });
});
