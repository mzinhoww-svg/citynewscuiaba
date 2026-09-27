import { buildCsp, SECURITY_HEADERS } from "./headers";

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
