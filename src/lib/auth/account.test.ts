import { describe, expect, it } from "vitest";
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  loginLock,
  parseSignIn,
  parseSignUp,
  passwordStrength,
  safeNext,
} from "./account";

const NOW = new Date("2026-09-27T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

describe("bloqueio de login (C02)", () => {
  it("conta tentativas restantes nos últimos 15 minutos", () => {
    expect(loginLock([], NOW)).toEqual({ locked: false, remaining: MAX_FAILURES });
    expect(loginLock([ago(1), ago(2)], NOW)).toEqual({ locked: false, remaining: 3 });
    expect(loginLock([ago(1), ago(20)], NOW)).toEqual({ locked: false, remaining: 4 });
  });
  it("bloqueia 15 minutos depois da 5ª falha", () => {
    const fails = [ago(1), ago(2), ago(3), ago(4), ago(5)];
    const r = loginLock(fails, NOW);
    expect(r.locked).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.locked && r.retryAt).toBe(
      new Date(ago(1).getTime() + LOCK_MINUTES * 60_000).toISOString(),
    );
  });
});

describe("força da senha em texto (C03)", () => {
  it("abaixo de 8 é curta; variedade melhora", () => {
    expect(passwordStrength("abc")).toEqual({
      level: "short",
      text: "Muito curta: use pelo menos 8 caracteres",
    });
    expect(passwordStrength("abcdefgh").level).toBe("weak");
    expect(passwordStrength("abcdefg1").level).toBe("fair");
    expect(passwordStrength("Abcdefg1!xyz").level).toBe("strong");
    expect(passwordStrength("Abcdefg1!xyz").text).toBe("Força da senha: forte");
  });
});

describe("formulários de conta", () => {
  it("entrar exige e-mail válido e senha", () => {
    expect(parseSignIn({ email: " Paulo@Email.com ", password: "x" })).toEqual({
      ok: true,
      value: { email: "paulo@email.com", password: "x" },
    });
    expect(parseSignIn({ email: "nao", password: "" }).ok).toBe(false);
  });
  it("criar conta: nome, e-mail, senha ≥ 8 e termos obrigatórios; newsletter opcional", () => {
    const base = { name: "Paulo", email: "p@e.com", password: "12345678", terms: "on" };
    expect(parseSignUp(base)).toEqual({
      ok: true,
      value: { name: "Paulo", email: "p@e.com", password: "12345678", newsletter: false },
    });
    const r = parseSignUp({ ...base, password: "123", terms: undefined, name: " " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.error).sort()).toEqual(["name", "password", "terms"]);
    expect(
      parseSignUp({ ...base, newsletter: "on" }).ok && parseSignUp({ ...base, newsletter: "on" }),
    ).toMatchObject({ value: { newsletter: true } });
  });
  it("next só aceita caminho interno", () => {
    expect(safeNext("/materia/x?y=1")).toBe("/materia/x?y=1");
    expect(safeNext("//evil.com")).toBe("/perfil");
    expect(safeNext("https://evil.com")).toBe("/perfil");
    expect(safeNext(undefined)).toBe("/perfil");
    expect(safeNext("/entrar")).toBe("/perfil");
  });
});
