// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newsletterSecret, signNewsletterToken, verifyNewsletterToken } from "./token";

describe("token assinado da newsletter (P19)", () => {
  it("token expira", () => {
    const t = signNewsletterToken("newsletter", "a@b.com", ["diaria"], -1);
    expect(verifyNewsletterToken(t, "newsletter")).toEqual({ ok: false, error: "expired" });
  });

  it("round-trip devolve e-mail e listas", () => {
    const t = signNewsletterToken("newsletter", "Ana@Exemplo.com", ["diaria", "agenda-fds"], 3600);
    expect(verifyNewsletterToken(t, "newsletter")).toEqual({
      ok: true,
      value: { email: "ana@exemplo.com", lists: ["diaria", "agenda-fds"] },
    });
  });

  it("assinatura adulterada, outro segredo ou lixo são inválidos", () => {
    const t = signNewsletterToken("newsletter", "a@b.com", ["diaria"], 3600);
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ p: "newsletter", e: "outra@b.com", l: ["diaria"], x: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifyNewsletterToken(`${forged}.${sig}`, "newsletter")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(verifyNewsletterToken(`${payload}.${sig}x`, "newsletter")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(verifyNewsletterToken(t, "newsletter", "outro-segredo")).toEqual({
      ok: false,
      error: "invalid",
    });
    for (const junk of ["", "abc", "a.b.c", "..."])
      expect(verifyNewsletterToken(junk, "newsletter")).toEqual({ ok: false, error: "invalid" });
  });

  it("finalidade: token de alerta não abre a newsletter, e vice-versa (gate P2, M11)", () => {
    const alert = signNewsletterToken("alert", "a@b.com", ["alert:1"], 3600);
    const news = signNewsletterToken("newsletter", "a@b.com", ["diaria"], 3600);
    expect(verifyNewsletterToken(alert, "newsletter")).toEqual({ ok: false, error: "invalid" });
    expect(verifyNewsletterToken(news, "alert")).toEqual({ ok: false, error: "invalid" });
    expect(verifyNewsletterToken(alert, "alert").ok).toBe(true);
    // Trocar só o campo de finalidade quebra a assinatura.
    const [payload, sig] = alert.split(".");
    const data = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    const swapped = Buffer.from(JSON.stringify({ ...data, p: "newsletter" })).toString("base64url");
    expect(verifyNewsletterToken(`${swapped}.${sig}`, "newsletter")).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("segredo: variável própria, depois CRON_SECRET; em produção sem nenhum, falha fechado", () => {
    expect(newsletterSecret({ NEWSLETTER_TOKEN_SECRET: "x", CRON_SECRET: "y" })).toBe("x");
    expect(newsletterSecret({ CRON_SECRET: "y" })).toBe("y");
    expect(newsletterSecret({ NODE_ENV: "production" })).toBeNull();
    expect(newsletterSecret({ NODE_ENV: "test" })).toBeTruthy();
  });
});
