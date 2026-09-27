import { describe, expect, it } from "vitest";
import { findPlace, NEIGHBORHOODS, resolveNeighborhood } from "./neighborhoods";

describe("dicionário de bairros", () => {
  it("nome mais longo vence e acento/caixa não importam", () => {
    expect(findPlace("Moradores do cpa iii relatam falta de água")).toMatchObject({
      municipality: "cuiaba",
      neighborhood: { name: "CPA III" },
    });
    expect(findPlace("Ônibus do CPA terão novo horário").neighborhood?.name).toBe("CPA");
    expect(findPlace("Obra na PEDRA 90").neighborhood?.name).toBe("Pedra 90");
  });

  it("município citado desempata e define a localidade", () => {
    expect(findPlace("Obra fecha rua no Cristo Rei, em Várzea Grande")).toEqual({
      municipality: "varzea-grande",
      neighborhood: expect.objectContaining({ name: "Cristo Rei" }),
    });
    expect(findPlace("Feira em Rondonópolis reúne produtores")).toEqual({
      municipality: "mt",
      neighborhood: null,
    });
    expect(findPlace("Mutirão no Centro de Cuiabá")).toEqual({
      municipality: "cuiaba",
      neighborhood: null,
    });
  });

  it("palavras comuns não viram bairro", () => {
    expect(findPlace("Porto Velho recebe feira nacional").neighborhood).toBeNull();
    expect(findPlace("Festival volta à Orla do Porto").neighborhood?.name).toBe("Porto");
    expect(findPlace("Sem lugar nenhum").municipality).toBeNull();
  });

  it("resolve respostas do agente só contra o dicionário", () => {
    expect(resolveNeighborhood("jardim italia")?.name).toBe("Jardim Itália");
    expect(resolveNeighborhood("Porto")?.name).toBe("Porto");
    expect(resolveNeighborhood("Bairro Inventado")).toBeNull();
  });

  it("nomes únicos por município", () => {
    const keys = NEIGHBORHOODS.map((n) => `${n.municipality}:${n.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
