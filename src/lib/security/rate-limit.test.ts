import { clientIp, ipKey } from "./rate-limit";

it("chave de IP é hash com sal diário, nunca o IP cru", () => {
  const a = ipKey("200.1.2.3", new Date("2026-09-27T10:00:00Z"), "sal");
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(a).not.toContain("200.1.2.3");
  expect(ipKey("200.1.2.3", new Date("2026-09-27T23:00:00Z"), "sal")).toBe(a);
  expect(ipKey("200.1.2.3", new Date("2026-09-28T10:00:00Z"), "sal")).not.toBe(a);
  expect(ipKey("200.1.2.4", new Date("2026-09-27T10:00:00Z"), "sal")).not.toBe(a);
});

it("IP do cliente vem do primeiro x-forwarded-for", () => {
  expect(clientIp(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
  expect(clientIp(new Headers({ "x-real-ip": "200.9.9.9" }))).toBe("200.9.9.9");
  expect(clientIp(new Headers())).toBe("desconhecido");
});

describe("checkRateLimit (janela fixa em memória)", () => {
  it("6ª tentativa em 1 h é recusada", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    for (let i = 0; i < 5; i++)
      expect(await checkRateLimit("ip:abc", 5, 3600, 1000 + i)).toBe(true);
    expect(await checkRateLimit("ip:abc", 5, 3600, 2000)).toBe(false);
  });
  it("chaves e janelas diferentes não se misturam", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    for (let i = 0; i < 5; i++) await checkRateLimit("ip:x", 5, 3600, 10);
    expect(await checkRateLimit("ip:y", 5, 3600, 10)).toBe(true);
    expect(await checkRateLimit("ip:x", 5, 3600, 3600 + 10)).toBe(true);
  });
});
