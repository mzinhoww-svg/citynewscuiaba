import { isCronAuthorized } from "./cron-auth";

const SECRET = "segredo-de-teste-com-32-caracteres!!";

describe("autorização de cron e worker", () => {
  it("aceita o Bearer certo", () =>
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true));
  it("recusa sem cabeçalho", () => expect(isCronAuthorized(null, SECRET)).toBe(false));
  it("recusa segredo errado, do mesmo tamanho ou não", () => {
    expect(isCronAuthorized(`Bearer ${SECRET.slice(0, -1)}X`, SECRET)).toBe(false);
    expect(isCronAuthorized("Bearer x", SECRET)).toBe(false);
  });
  it("recusa esquema diferente de Bearer", () =>
    expect(isCronAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false));
  it("falha fechado quando o servidor não tem segredo", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("segredo fraco ou de exemplo (C4-02)", () => {
  it("o placeholder do .env.example nunca autoriza, mesmo enviado certo", () => {
    const placeholder = "substituir-por-32-caracteres-aleatorios";
    expect(isCronAuthorized(`Bearer ${placeholder}`, placeholder)).toBe(false);
  });
  it("segredo com menos de 32 caracteres nunca autoriza", () => {
    const short = "a".repeat(31);
    expect(isCronAuthorized(`Bearer ${short}`, short)).toBe(false);
    expect(isCronAuthorized(`Bearer ${"a".repeat(32)}`, "a".repeat(32))).toBe(true);
  });
});
