// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newsletterSecret, signNewsletterToken, verifyNewsletterToken } from "./token";

describe("token assinado da newsletter (P19)", () => {
  it("token expira", () => {
    const t = signNewsletterToken("a@b.com", ["diaria"], -1);
    expect(verifyNewsletterToken(t)).toEqual({ ok: false, error: "expired" });
  });

  it("round-trip devolve e-mail e listas", () => {
    const t = signNewsletterToken("Ana@Exemplo.com", ["diaria", "agenda-fds"], 3600);
    expect(verifyNewsletterToken(t)).toEqual({
      ok: true,
      value: { email: "ana@exemplo.com", lists: ["diaria", "agenda-fds"] },
    });
  });

  it("assinatura adulterada, outro segredo ou lixo são inválidos", () => {
    const t = signNewsletterToken("a@b.com", ["diaria"], 3600);
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "outra@b.com", l: ["diaria"], x: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifyNewsletterToken(`${forged}.${sig}`)).toEqual({ ok: false, error: "invalid" });
    expect(verifyNewsletterToken(`${payload}.${sig}x`)).toEqual({ ok: false, error: "invalid" });
    expect(verifyNewsletterToken(t, "outro-segredo")).toEqual({ ok: false, error: "invalid" });
    for (const junk of ["", "abc", "a.b.c", "..."])
      expect(verifyNewsletterToken(junk)).toEqual({ ok: false, error: "invalid" });
  });

  it("segredo: variável própria, depois CRON_SECRET; em produção sem nenhum, falha fechado", () => {
    expect(newsletterSecret({ NEWSLETTER_TOKEN_SECRET: "x", CRON_SECRET: "y" })).toBe("x");
    expect(newsletterSecret({ CRON_SECRET: "y" })).toBe("y");
    expect(newsletterSecret({ NODE_ENV: "production" })).toBeNull();
    expect(newsletterSecret({ NODE_ENV: "test" })).toBeTruthy();
  });
});
