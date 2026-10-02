import nextConfig from "../../../next.config";
import { buildCsp, SECURITY_HEADERS, STATIC_ASSET_HEADERS } from "./headers";

it("CSP estrita com nonce, sem unsafe-inline em script", () => {
  const csp = buildCsp({ nonce: "abc", dev: false, https: true });
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("upgrade-insecure-requests");
});

it("inclui a origem do Supabase em imagens e conexões quando configurada", () => {
  const csp = buildCsp({
    nonce: "n",
    dev: false,
    https: false,
    supabaseUrl: "https://x.supabase.co/",
  });
  expect(csp).toMatch(/img-src [^;]*https:\/\/x\.supabase\.co/);
  expect(csp).toMatch(/connect-src [^;]*https:\/\/x\.supabase\.co/);
  expect(csp).not.toContain("upgrade-insecure-requests");
});

it("desenvolvimento libera eval para o React", () => {
  expect(buildCsp({ nonce: "n", dev: true, https: false })).toContain("'unsafe-eval'");
});

it("cabeçalhos fixos: HSTS, Referrer-Policy, Permissions-Policy e nosniff", () => {
  const h = Object.fromEntries(SECURITY_HEADERS.map((x) => [x.key, x.value]));
  expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
  expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["Permissions-Policy"]).toContain("camera=()");
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
  expect(h["X-Frame-Options"]).toBe("DENY");
});

it("arquivos imutáveis do build levam só o nosniff; o resto, todos os cabeçalhos (B-018)", async () => {
  expect(STATIC_ASSET_HEADERS.map((h) => h.key)).toEqual(["X-Content-Type-Options"]);
  const rules = (await nextConfig.headers?.()) ?? [];
  const statics = rules.find((r) => r.source === "/_next/static/:path*");
  expect(statics?.headers.map((h) => h.key)).toEqual(["X-Content-Type-Options"]);
  const all = rules.find((r) => r.source.startsWith("/(("));
  expect(all?.headers).toHaveLength(SECURITY_HEADERS.length);
  // A regra geral não casa com /_next/static/…, então não repete cabeçalho nos arquivos.
  const re = new RegExp(`^${all?.source.replace("/(", "/(")}$`);
  expect(re.test("/_next/static/chunks/a.js")).toBe(false);
  expect(re.test("/materia/x")).toBe(true);
  expect(re.test("/api/eventos")).toBe(true);
});
