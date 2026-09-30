// @vitest-environment node
// CSP com nonce e cabeçalhos de segurança (architecture §7). Roda o `proxy` e o `headers()` do
// next.config de verdade; o e2e `tests/e2e/security-http.spec.ts` confere o mesmo no servidor.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { config as proxyConfig, proxy } from "@/proxy";
import { ldScript } from "@/lib/seo/jsonld";

const ORIGIN = "https://citynews.example";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name!, values] as const;
      }),
  );
}

async function cspFor(path: string, headers: Record<string, string> = {}) {
  const res = await proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
  return { res, csp: res.headers.get("content-security-policy") ?? "" };
}

describe("CSP emitida pelo proxy", () => {
  it.each(["/", "/busca?q=viaduto", "/fontes", "/pergunte", "/estudio/fila", "/entrar"])(
    "%s sai com CSP",
    async (path) => {
      const { csp } = await cspFor(path);
      expect(csp).not.toBe("");
    },
  );

  it("scripts: nonce + strict-dynamic, sem unsafe-inline, unsafe-eval nem curinga", async () => {
    const { csp } = await cspFor("/");
    const d = directives(csp);
    const script = d.get("script-src")!;
    expect(script).toContain("'self'");
    expect(script.some((v) => /^'nonce-[A-Za-z0-9+/=_-]{16,}'$/.test(v))).toBe(true);
    expect(script).toContain("'strict-dynamic'");
    for (const bad of [
      "'unsafe-inline'",
      "'unsafe-eval'",
      "*",
      "https:",
      "http:",
      "data:",
      "blob:",
    ])
      expect(script, bad).not.toContain(bad);
    expect(d.has("script-src-attr")).toBe(false); // herda script-src: handlers inline bloqueados
  });

  it("nonce muda a cada requisição e é o mesmo entregue ao Next (x-nonce)", async () => {
    const a = await cspFor("/");
    const b = await cspFor("/");
    const nonce = (csp: string) => /'nonce-([^']+)'/.exec(csp)![1]!;
    expect(nonce(a.csp)).not.toBe(nonce(b.csp));
    // Cabeçalhos da requisição repassados ao render (NextResponse.next com `request.headers`).
    const forwarded = a.res.headers.get("x-middleware-request-x-nonce");
    expect(forwarded).toBe(nonce(a.csp));
    expect(a.res.headers.get("x-middleware-request-content-security-policy")).toBe(a.csp);
  });

  it("restrições de origem: objetos, base, formulários, frames, manifest e workers", async () => {
    const d = directives((await cspFor("/")).csp);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("manifest-src")).toEqual(["'self'"]);
    expect(d.get("worker-src")).toEqual(["'self'"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
  });

  it("img-src e connect-src não abrem para a internet toda", async () => {
    const d = directives((await cspFor("/")).csp);
    for (const name of ["img-src", "connect-src", "style-src"]) {
      const v = d.get(name)!;
      for (const bad of ["*", "https:", "http:"]) expect(v, `${name} ${bad}`).not.toContain(bad);
    }
    // `style-src` aceita inline por causa dos atributos `style` (tokens em variáveis CSS);
    // `unsafe-inline` não vale para script (verificado acima).
    expect(d.get("style-src")).toContain("'unsafe-inline'");
  });

  it("HTTPS pede upgrade de conteúdo misto; HTTP local não", async () => {
    expect((await cspFor("/", { "x-forwarded-proto": "https" })).csp).toContain(
      "upgrade-insecure-requests",
    );
    expect((await cspFor("/", { "x-forwarded-proto": "http" })).csp).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("o matcher cobre páginas HTML e deixa de fora API e estáticos", () => {
    const rule = proxyConfig.matcher[0]!;
    const re = new RegExp(`^${rule.source}$`);
    for (const p of ["/", "/materia/plano-onibus", "/estudio/fila", "/busca", "/pergunte"])
      expect(re.test(p), p).toBe(true);
    for (const p of ["/api/events", "/_next/static/a.js", "/sw.js", "/robots.txt", "/icons/a.png"])
      expect(re.test(p), p).toBe(false);
  });
});

describe("cabeçalhos fixos do next.config", () => {
  async function headers() {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all, "regra /:path*").toBeDefined();
    return new Map(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));
  }

  it("HSTS de 2 anos com subdomínios e preload", async () => {
    const v = (await headers()).get("strict-transport-security")!;
    expect(Number(/max-age=(\d+)/.exec(v)![1])).toBeGreaterThanOrEqual(31_536_000);
    expect(v).toContain("includeSubDomains");
    expect(v).toContain("preload");
  });

  it("nosniff, DENY, referrer, COOP e permissões", async () => {
    const h = await headers();
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    const perms = h.get("permissions-policy")!;
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"])
      expect(perms).toContain(`${feature}=()`);
  });

  it("não anuncia o framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("nenhum script inline sem nonce no código", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
    });
  }
  const source = files("src/app").concat(files("src/components"));

  it("todo <script> é dado (ld+json) ou leva nonce", () => {
    const offenders: string[] = [];
    for (const file of source) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<script\b([^>]*?)(?:\/>|>)/gs)) {
        const attrs = m[1] ?? "";
        if (/type=["']application\/ld\+json["']/.test(attrs)) continue;
        if (/\bnonce=\{/.test(attrs)) continue;
        offenders.push(`${file}: <script${attrs.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nenhum handler inline (onClick= em string HTML) nem javascript: em href", () => {
    const bad: string[] = [];
    for (const file of source) {
      const text = readFileSync(file, "utf8");
      if (/href=["']javascript:/i.test(text)) bad.push(`${file}: javascript:`);
      if (/dangerouslySetInnerHTML/.test(text) && !/ld\+json|themeScript|ldScript/.test(text))
        bad.push(`${file}: dangerouslySetInnerHTML fora de JSON-LD/tema`);
    }
    expect(bad).toEqual([]);
  });

  it("JSON-LD escapa '<' e não deixa fechar a tag", () => {
    const out = ldScript({ name: "</script><script>alert(1)</script>" } as never);
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });
});
