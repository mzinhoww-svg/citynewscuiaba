import { cronSecretProblem, serverEnvWarnings } from "./env-check";

describe("validação de ambiente (C4-02, C4-03)", () => {
  it("cronSecretProblem aponta ausente, placeholder e curto", () => {
    expect(cronSecretProblem(undefined)).toBe("missing");
    expect(cronSecretProblem("  ")).toBe("missing");
    expect(cronSecretProblem("substituir-por-32-caracteres-aleatorios")).toBe("placeholder");
    expect(cronSecretProblem("x".repeat(31))).toBe("short");
    expect(cronSecretProblem("x".repeat(32))).toBeNull();
  });

  it("em produção avisa segredo de cron fraco e segredos derivados do CRON_SECRET", () => {
    const strong = "k".repeat(40);
    expect(serverEnvWarnings({ NODE_ENV: "development", CRON_SECRET: "x" })).toEqual([]);
    const weak = serverEnvWarnings({ NODE_ENV: "production", CRON_SECRET: "x" });
    expect(weak.some((w) => w.includes("CRON_SECRET"))).toBe(true);
    const derived = serverEnvWarnings({ NODE_ENV: "production", CRON_SECRET: strong });
    expect(derived.some((w) => w.includes("NEWSLETTER_TOKEN_SECRET"))).toBe(true);
    expect(derived.some((w) => w.includes("RATE_LIMIT_SALT"))).toBe(true);
    expect(
      serverEnvWarnings({
        NODE_ENV: "production",
        CRON_SECRET: strong,
        NEWSLETTER_TOKEN_SECRET: "n".repeat(40),
        RATE_LIMIT_SALT: "r".repeat(40),
      }),
    ).toEqual([]);
  });
});
