import { expect, test } from "@playwright/test";

/*
 * Segurança por HTTP no servidor de produção (P6 tarefa 3): CSP com nonce nas páginas, cabeçalhos
 * fixos em tudo, cron sem segredo → 401 e rotas do Estúdio sem sessão recusadas. Complementa
 * `tests/security/*.test.ts`, que roda o proxy e os handlers em processo.
 */
const PAGES = ["/", "/busca?q=viaduto", "/fontes", "/pergunte", "/entrar", "/privacidade"];
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

const directive = (csp: string, name: string): string[] =>
  (csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1) ?? []) as string[];

test.describe("CSP e cabeçalhos", () => {
  for (const path of [...PAGES, ARTICLE]) {
    test(`${path}: CSP com nonce que cobre todos os scripts da página`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBeLessThan(400);
      const csp = res.headers()["content-security-policy"] ?? "";
      const script = directive(csp, "script-src");
      expect(script).toContain("'strict-dynamic'");
      expect(script.join(" ")).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/);
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce).toBeTruthy();
      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1] ?? "");
      expect(scripts.length).toBeGreaterThan(0);
      for (const attrs of scripts) {
        if (/type=["']application\/ld\+json["']/.test(attrs)) continue;
        expect(attrs, `script sem nonce: ${attrs.slice(0, 80)}`).toContain(`nonce="${nonce}"`);
      }
      // Sem handler inline (bloqueado pela CSP de qualquer forma).
      expect(html).not.toMatch(/\son(?:click|load|error|mouseover)=/i);
    });
  }

  test("o nonce muda a cada resposta", async ({ request }) => {
    const nonce = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get("/")).headers()["content-security-policy"] ?? "",
      )?.[1];
    const [a, b] = [await nonce(), await nonce()];
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("páginas navegam sem violação de CSP no console", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => {
      if (/Content Security Policy/i.test(e.message)) errors.push(e.message);
    });
    for (const path of [...PAGES, ARTICLE]) {
      await page.goto(path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
    }
    expect(errors).toEqual([]);
  });

  for (const path of ["/", "/api/ingest/status", "/api/events", "/sw.js", "/robots.txt"]) {
    test(`${path}: cabeçalhos de segurança fixos`, async ({ request }) => {
      const h = (await request.get(path)).headers();
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{8,}; includeSubDomains; preload/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["cross-origin-opener-policy"]).toBe("same-origin");
      expect(h["x-powered-by"]).toBeUndefined();
    });
  }
});

test.describe("cron e worker sem segredo", () => {
  const cron: [string, "get" | "post"][] = [
    ["/api/ingest/tick", "post"],
    ["/api/ingest/fast-tick", "post"],
    ["/api/ingest/status", "get"],
    ["/api/jobs/drain", "post"],
    ["/api/jobs/revalidate", "post"],
  ];
  for (const [path, method] of cron) {
    test(`${method.toUpperCase()} ${path} → 401`, async ({ request }) => {
      for (const headers of [
        {} as Record<string, string>,
        { authorization: "Bearer segredo-errado" },
        { authorization: "Bearer " },
      ]) {
        const res = await request[method](path, { headers });
        expect(res.status()).toBe(401);
        expect(await res.json()).toEqual({ error: "unauthorized" });
      }
    });
  }
});

test.describe("rotas do Estúdio sem sessão", () => {
  test("GET das rotas de leitura protegida devolve 401, 403 ou 404", async ({ request }) => {
    for (const path of [
      "/api/control/live",
      "/api/control/logs/export",
      "/api/estudio/midia/00000000-0000-4000-8000-000000000000",
      "/estudio/admin/auditoria/export",
      "/estudio/admin/notificacoes/historico/exportar",
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([401, 403, 404, 307, 302, 303], path).toContain(res.status());
      const body = await res.text();
      expect(body, path).not.toMatch(/"rows"|"events"|helena|@citynews\.local/i);
    }
  });

  test("POST run-now: de outra origem 403; da mesma origem sem sessão não executa", async ({
    request,
    baseURL,
  }) => {
    const other = await request.post("/api/control/run-now", {
      headers: { origin: "https://evil.example" },
      data: {},
    });
    expect(other.status()).toBe(403);
    const same = await request.post("/api/control/run-now", {
      headers: { origin: baseURL! },
      data: {},
    });
    expect([401, 403]).toContain(same.status());
  });

  test("/estudio manda quem não entrou para o login", async ({ page }) => {
    await page.goto("/estudio");
    await expect(page).toHaveURL(/\/entrar\?next=%2Festudio/);
  });
});
