import { describe, expect, it } from "vitest";
import {
  failureItemHref,
  failureKey,
  failureRunHref,
  groupFailures,
  normalizeFailureMessage,
} from "./group-failures";

const job = (id: number, step: string, error: string) => ({ id, step, error });

describe("normalizeFailureMessage", () => {
  it("troca números e ids por marcadores e junta espaços", () => {
    expect(normalizeFailureMessage("timeout after 3000ms on item 12")).toBe(
      "timeout after #ms on item #",
    );
    expect(
      normalizeFailureMessage("item:4f1c2a9e-0b7d-4c1e-9f3a-2d6b8e0c1a77  não encontrado"),
    ).toBe("item:‹id› não encontrado");
    expect(normalizeFailureMessage("hash deadbeefcafe1234 inválido")).toBe("hash ‹id› inválido");
  });
});

describe("groupFailures", () => {
  it("junta a mesma etapa e o mesmo erro com números diferentes", () => {
    const groups = groupFailures([
      job(1, "classify", "timeout after 3000ms on item 12"),
      job(2, "classify", "timeout after 3000ms on item 99"),
      job(3, "summarize", "timeout after 3000ms on item 12"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      key: failureKey("classify", "timeout after 3000ms on item 12"),
      step: "classify",
      message: "timeout after #ms on item #",
      count: 2,
      ids: ["1", "2"],
    });
    expect(groups[1]).toMatchObject({ step: "summarize", count: 1, ids: ["3"] });
  });

  it("ordena por contagem e depois por etapa", () => {
    const groups = groupFailures([
      job(1, "fetch", "HTTP 503"),
      job(2, "embed", "HTTP 503"),
      job(3, "embed", "HTTP 503"),
      job(4, "classify", "HTTP 429"),
    ]);
    expect(groups.map((g) => `${g.step}:${g.count}`)).toEqual(["embed:2", "classify:1", "fetch:1"]);
  });

  it("lista vazia não tem grupos", () => {
    expect(groupFailures([])).toEqual([]);
  });
});

describe("links da falha", () => {
  it("objeto válido abre os logs filtrados; referência desconhecida não vira link", () => {
    expect(failureItemHref("item:abc-123")).toBe("/estudio/control/logs?item=item%3Aabc-123");
    expect(failureItemHref("?")).toBeNull();
  });
  it("execução só com uuid", () => {
    const id = "4f1c2a9e-0b7d-4c1e-9f3a-2d6b8e0c1a77";
    expect(failureRunHref(id)).toBe(`/estudio/control/execucoes/${id}`);
    expect(failureRunHref(null)).toBeNull();
    expect(failureRunHref("x")).toBeNull();
  });
});
