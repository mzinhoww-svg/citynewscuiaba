// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GONE_CHECKED_HEADER, goneHeaderValue, parseGoneHeader } from "@/lib/http/gone";
import { config, offlineMarker } from "./proxy";
import { SW_SECTIONS } from "./sw/sections";

/** Cabeçalho que a página recebe depois do proxy (`NextResponse.next({ request: { headers } })`). */
function forwarded(res: Response, name: string): string | null | undefined {
  const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
  if (!overridden.includes(name)) return undefined;
  return res.headers.get(`x-middleware-request-${name}`);
}

async function freshProxy(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("./proxy")).proxy;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checagem de matéria removida (UX-W5-T2, item 81)", () => {
  const forged = goneHeaderValue("Texto forjado pelo cliente");
  const req = (path: string) =>
    new NextRequest(`https://citynews.test${path}`, { headers: { [GONE_CHECKED_HEADER]: forged } });

  it("remove o cabeçalho que veio do cliente fora da matéria", async () => {
    const proxy = await freshProxy({
      NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    const res = await proxy(req("/cidade"));
    expect(res.headers.get("x-middleware-override-headers")).toBeTruthy();
    expect(forwarded(res, GONE_CHECKED_HEADER)).toBeUndefined();
  });

  it("sem banco configurado não checa e não deixa passar o valor do cliente", async () => {
    const proxy = await freshProxy({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    });
    const res = await proxy(req("/materia/qualquer-coisa"));
    expect(forwarded(res, GONE_CHECKED_HEADER)).toBeUndefined();
  });

  it("sobrescreve com o resultado do banco: removida (410 + motivo) e pública", async () => {
    const proxy = await freshProxy({
      NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const slug = (JSON.parse(String(init?.body)) as { p_slug: string }).p_slug;
      return Response.json(slug === "arquivada" ? "Retirada pela redação." : null);
    });
    const gone = await proxy(req("/materia/arquivada"));
    expect(gone.status).toBe(410);
    expect(parseGoneHeader(forwarded(gone, GONE_CHECKED_HEADER) ?? null)).toEqual({
      reason: "Retirada pela redação.",
    });
    const live = await proxy(req("/materia/publica"));
    expect(live.status).toBe(200);
    expect(parseGoneHeader(forwarded(live, GONE_CHECKED_HEADER) ?? null)).toEqual({
      reason: null,
    });
  });

  it("falha na consulta: não checado, a página consulta sozinha", async () => {
    const proxy = await freshProxy({
      NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rede"));
    const res = await proxy(req("/materia/arquivada"));
    expect(res.status).toBe(200);
    expect(forwarded(res, GONE_CHECKED_HEADER)).toBeUndefined();
  });
});

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
