import { describe, expect, it } from "vitest";
import { config, offlineMarker } from "./proxy";
import { SW_SECTIONS } from "./sw/sections";

describe("offlineMarker (Review Focus 1)", () => {
  it("marca rotas da allowlist sem sessão; nunca com cookie de sessão nem fora da allowlist", () => {
    expect(offlineMarker("/", null, SW_SECTIONS)).toBe(true);
    expect(offlineMarker("/cidade", "cn_theme=dark", SW_SECTIONS)).toBe(true);
    expect(offlineMarker("/materia/chuva", "cn_consent=v1|m1|p0", SW_SECTIONS)).toBe(true);
    expect(offlineMarker("/favoritos", null, SW_SECTIONS)).toBe(true);
    expect(offlineMarker("/materia/chuva", "sb-abc-auth-token=xyz", SW_SECTIONS)).toBe(false);
    expect(offlineMarker("/materia/chuva", "sb-abc-auth-token.0=xyz", SW_SECTIONS)).toBe(false);
    expect(offlineMarker("/", "a=1; sb-127-auth-token-code-verifier=x", SW_SECTIONS)).toBe(false);
    for (const p of [
      "/perfil",
      "/busca",
      "/estudio",
      "/alertas",
      "/entrar",
      "/api/events",
      "/pergunte",
      "/privacidade",
      "/nao-existe",
    ])
      expect(offlineMarker(p, null, SW_SECTIONS), p).toBe(false);
  });

  it("matcher não passa ícones, manifesto, SW nem offline.* pelo proxy", () => {
    const re = new RegExp(`^${config.matcher[0]!.source}$`);
    for (const p of [
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/sw.js",
      "/offline.html",
      "/offline.js",
      "/offline.css",
      "/api/push/receipt",
      "/_next/static/x.js",
    ])
      expect(re.test(p), p).toBe(false);
    for (const p of ["/", "/cidade", "/materia/x", "/estudio", "/privacidade"])
      expect(re.test(p), p).toBe(true);
  });
});
