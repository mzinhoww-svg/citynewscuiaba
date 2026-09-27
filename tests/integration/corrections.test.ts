// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listCorrections } from "@/lib/db/queries";

describe("correções públicas (P1-T10)", () => {
  it("lista as correções publicadas com data e link para a matéria", async () => {
    const r = await listCorrections();
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const c = r.value.find((x) => /20 minutos, não 18/.test(x.note));
    expect(c).toBeDefined();
    expect(c?.publishedAt).toBeTruthy();
    expect(c?.article?.href).toBe("/materia/com-fumaca-escolas-ajustam-horario-de-educacao-fisica");
  });
});
