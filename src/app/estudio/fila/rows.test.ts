import { describe, expect, it } from "vitest";
import { queueFilterFrom, queueFilterFromOrigin, queueListHref } from "./rows";

describe("fila · aba e filtros na URL (UX-W3-T1, item 46)", () => {
  it("lê e valida aba e filtros", () => {
    const { tab, filter } = queueFilterFrom({
      aba: "exceptions",
      estado: "in_review",
      editoria: "cidade",
      confianca: "inventada",
      prazo: "vencido",
    });
    expect(tab).toBe("exceptions");
    expect(filter).toMatchObject({
      tab: "exceptions",
      status: "in_review",
      section: "cidade",
      confidence: undefined,
      due: "overdue",
    });
  });

  it("a URL da lista volta a dar os mesmos filtros (ida e volta pelo ?de=)", () => {
    const { tab, values, filter } = queueFilterFrom({ aba: "mine", origem: "pipeline" });
    const href = queueListHref(tab, values);
    expect(href).toBe("/estudio/fila?aba=mine&origem=pipeline");
    expect(queueFilterFromOrigin(href)).toEqual(filter);
  });

  it("origem fora da fila não vira filtro", () => {
    expect(queueFilterFromOrigin("/estudio/midia?estado=pendentes")).toBeNull();
  });
});
