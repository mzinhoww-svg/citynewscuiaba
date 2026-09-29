import { describe, expect, it } from "vitest";
import { bearer, hashToken, newManageToken, tokenMatches } from "./token";
import { missingVapidVars, pushEnabled, vapidConfig } from "./server";
import { outcomeForStatus, parseRetryAfter } from "./sender";

describe("token de gestão (D-P13)", () => {
  it("32 bytes base64url, hash sha256, comparação constante", () => {
    const { token, hash } = newManageToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches("outro", hash)).toBe(false);
    expect(tokenMatches(null, hash)).toBe(false);
  });
  it("bearer", () => {
    const h = (a?: string) => new Request("https://x/", { headers: a ? { authorization: a } : {} });
    expect(bearer(h(`Bearer ${"a".repeat(43)}`))).toBe("a".repeat(43));
    expect(bearer(h("Basic x"))).toBeNull();
    expect(bearer(h())).toBeNull();
    expect(bearer(h("Bearer curto"))).toBeNull();
  });
});

describe("VAPID (D-P25)", () => {
  const ok = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "B".repeat(87),
    VAPID_PRIVATE_KEY: "p".repeat(43),
    VAPID_SUBJECT: "mailto:dpo@citynews.local",
  };
  it("lista só os nomes que faltam", () => {
    expect(missingVapidVars({})).toEqual([
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ]);
    expect(missingVapidVars({ ...ok, VAPID_SUBJECT: "" })).toEqual(["VAPID_SUBJECT"]);
    expect(missingVapidVars(ok)).toEqual([]);
    expect(missingVapidVars({ ...ok, VAPID_SUBJECT: "dpo@x" })).toHaveLength(3);
    expect(JSON.stringify(missingVapidVars({ ...ok, VAPID_PRIVATE_KEY: "" }))).not.toContain(
      "B".repeat(20),
    );
  });
  it("config só com as três válidas; fake habilita sem chave", () => {
    expect(vapidConfig(ok)).toEqual({
      publicKey: ok.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: ok.VAPID_PRIVATE_KEY,
      subject: ok.VAPID_SUBJECT,
    });
    expect(vapidConfig({})).toBeNull();
    expect(pushEnabled({})).toBe(false);
    expect(pushEnabled({ PUSH_PROVIDER: "fake" })).toBe(true);
    expect(pushEnabled(ok)).toBe(true);
  });
});

describe("resposta do serviço de push", () => {
  it("status → resultado", () => {
    expect(outcomeForStatus(201, null)).toEqual({ kind: "accepted" });
    expect(outcomeForStatus(410, null)).toEqual({ kind: "gone", status: 410 });
    expect(outcomeForStatus(429, "900")).toEqual({
      kind: "retry",
      status: 429,
      retryAfterSec: 900,
    });
    expect(outcomeForStatus(503, null)).toEqual({
      kind: "retry",
      status: 503,
      retryAfterSec: null,
    });
    expect(outcomeForStatus(403, null)).toEqual({
      kind: "failed",
      status: 403,
      vapidInvalid: true,
    });
    expect(outcomeForStatus(413, null)).toEqual({
      kind: "failed",
      status: 413,
      vapidInvalid: false,
    });
  });
  it("Retry-After em segundos ou data", () => {
    const now = Date.parse("2026-09-28T15:00:00Z");
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter("Mon, 28 Sep 2026 15:05:00 GMT", now)).toBe(300);
    expect(parseRetryAfter("lixo")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});
