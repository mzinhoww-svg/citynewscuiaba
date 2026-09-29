import { describe, expect, it } from "vitest";
import { integrationStates } from "./integrations";

const FULL = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-segredo",
  SUPABASE_SERVICE_ROLE_KEY: "service-segredo",
};
const by = (rows: ReturnType<typeof integrationStates>, id: string) =>
  rows.find((r) => r.id === id);

describe("integrationStates", () => {
  it("lista as cinco integrações", () => {
    expect(integrationStates({}, { dbOk: false, queuedEmails: 0 }).map((r) => r.id)).toEqual([
      "supabase",
      "openrouter",
      "email",
      "google",
      "vercel",
    ]);
  });
  it("Supabase: conectado, com erro ou desligado", () => {
    expect(by(integrationStates(FULL, { dbOk: true, queuedEmails: 0 }), "supabase")?.state).toBe(
      "connected",
    );
    expect(by(integrationStates(FULL, { dbOk: false, queuedEmails: 0 }), "supabase")?.state).toBe(
      "error",
    );
    expect(by(integrationStates({}, { dbOk: true, queuedEmails: 0 }), "supabase")?.state).toBe(
      "off",
    );
  });
  it("OpenRouter sem chave ou com AI_PROVIDER=fake é simulado (B-008)", () => {
    const p = { dbOk: true, queuedEmails: 0 };
    expect(by(integrationStates({}, p), "openrouter")).toMatchObject({
      state: "simulated",
      blocker: "B-008",
    });
    expect(
      by(integrationStates({ OPENROUTER_API_KEY: "k", AI_PROVIDER: "fake" }, p), "openrouter")
        ?.state,
    ).toBe("simulated");
    expect(by(integrationStates({ OPENROUTER_API_KEY: "k" }, p), "openrouter")).toMatchObject({
      state: "connected",
    });
  });
  it("e-mail segue na fila (B-005) e mostra o tamanho dela", () => {
    expect(by(integrationStates({}, { dbOk: true, queuedEmails: 7 }), "email")).toMatchObject({
      state: "pending",
      blocker: "B-005",
      fact: "7",
    });
  });
  it("Google só conectado com AUTH_GOOGLE_ENABLED=1 (B-006)", () => {
    const p = { dbOk: true, queuedEmails: 0 };
    expect(by(integrationStates({}, p), "google")).toMatchObject({
      state: "pending",
      blocker: "B-006",
    });
    expect(by(integrationStates({ AUTH_GOOGLE_ENABLED: "1" }, p), "google")?.state).toBe(
      "connected",
    );
  });
  it("Vercel: só o ambiente, nunca segredo", () => {
    const p = { dbOk: true, queuedEmails: 0 };
    expect(by(integrationStates({ VERCEL: "1", VERCEL_ENV: "production" }, p), "vercel")).toEqual({
      id: "vercel",
      state: "connected",
      fact: "production",
    });
    expect(by(integrationStates({}, p), "vercel")?.state).toBe("off");
  });
  it("nenhum valor de variável de ambiente vaza no resultado", () => {
    const env = {
      ...FULL,
      OPENROUTER_API_KEY: "sk-or-segredo",
      CRON_SECRET: "cron-segredo",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    };
    const json = JSON.stringify(integrationStates(env, { dbOk: true, queuedEmails: 1 }));
    for (const secret of ["segredo", "supabase.co", "sk-or"]) expect(json).not.toContain(secret);
  });
});
