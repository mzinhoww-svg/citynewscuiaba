import { describe, expect, it } from "vitest";
import {
  ACCEPT_ALL,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  NECESSARY_ONLY,
  consentCookie,
  parseConsent,
  readConsentCookie,
  serializeConsent,
} from "./index";

describe("parseConsent", () => {
  it("sem cookie = só necessário e não decidido", () =>
    expect(parseConsent(undefined)).toEqual({
      version: "v1",
      metrics: false,
      personalization: false,
      decided: false,
    }));

  it("round-trip", () =>
    expect(
      parseConsent(
        serializeConsent({ version: "v1", metrics: true, personalization: true, decided: true }),
      ).personalization,
    ).toBe(true));

  it("cookie malformado = padrão", () => expect(parseConsent("lixo").decided).toBe(false));

  it("lê cada categoria separadamente", () => {
    expect(parseConsent("v1|m1|p0")).toEqual({
      version: "v1",
      metrics: true,
      personalization: false,
      decided: true,
    });
    expect(parseConsent("v1|m0|p1")).toMatchObject({ metrics: false, personalization: true });
  });

  it("aceita o valor codificado para URL", () =>
    expect(parseConsent("v1%7Cm1%7Cp1")).toMatchObject({ decided: true, personalization: true }));

  it("versão antiga da política pede nova escolha", () =>
    expect(parseConsent("v0|m1|p1")).toEqual(parseConsent(undefined)));

  it("valores fora de 0/1 não contam como escolha", () => {
    expect(parseConsent("v1|m2|p0").decided).toBe(false);
    expect(parseConsent("v1|m1|p1|x").decided).toBe(false);
    expect(parseConsent("%E0%A4%A").decided).toBe(false);
  });
});

describe("serializeConsent", () => {
  it("usa o formato v1|m0|p0", () => {
    expect(serializeConsent(NECESSARY_ONLY)).toBe("v1|m0|p0");
    expect(serializeConsent(ACCEPT_ALL)).toBe("v1|m1|p1");
  });
});

describe("consentCookie", () => {
  it("é first-party, dura 12 meses e vale para o site todo", () => {
    const c = consentCookie(ACCEPT_ALL, { secure: true });
    expect(c).toBe(
      `${CONSENT_COOKIE}=v1|m1|p1; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax; Secure`,
    );
    expect(consentCookie(NECESSARY_ONLY, { secure: false })).not.toContain("Secure");
    expect(c).not.toMatch(/Domain=/i);
  });
});

describe("readConsentCookie", () => {
  it("acha o cookie entre outros", () => {
    expect(readConsentCookie("a=1; cn_consent=v1|m1|p0; b=2")).toMatchObject({
      decided: true,
      metrics: true,
    });
    expect(readConsentCookie("cn_consent_x=v1|m1|p1").decided).toBe(false);
    expect(readConsentCookie("").decided).toBe(false);
  });
});
