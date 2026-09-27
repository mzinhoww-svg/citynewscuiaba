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
