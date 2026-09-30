import { describe, expect, it } from "vitest";
import { E2E_NOW_HEADER, pushClockFromRequest } from "./clock";

const h = (v: string | null) => ({ get: (k: string) => (k === E2E_NOW_HEADER ? v : null) });

describe("pushClockFromRequest", () => {
  const target = new Date(Date.now() - 3 * 3_600_000).toISOString();

  it("ignora o cabeçalho sem CN_E2E (produção)", () => {
    const now = pushClockFromRequest(h(target), {})();
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(1_000);
  });

  it("com CN_E2E=1 desloca o agora para o instante pedido", () => {
    const now = pushClockFromRequest(h(target), { CN_E2E: "1" })();
    expect(Math.abs(now.getTime() - Date.parse(target))).toBeLessThan(1_000);
  });

  it("ignora valor inválido ou distante demais", () => {
    for (const bad of ["lixo", "2001-01-01T00:00:00Z", null]) {
      const now = pushClockFromRequest(h(bad), { CN_E2E: "1" })();
      expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(1_000);
    }
  });
});
