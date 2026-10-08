// @vitest-environment node
// Rotas de cron e worker só respondem com `Authorization: Bearer ${CRON_SECRET}` (CLAUDE.md §8).
// Chama os handlers de verdade sem segredo, com segredo errado e com o segredo ausente do
// ambiente; e varre `src/app` para que nenhuma rota nova fique sem classificação.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A primeira importação de cada rota compila a árvore de dependências do pipeline.
vi.setConfig({ testTimeout: 30_000 });

const SECRET = "segredo-de-cron-para-teste-de-seguranca-32+";

type Handler = (req: Request) => Promise<Response> | Response;
const CRON_ROUTES: {
  path: string;
  method: "GET" | "POST";
  load: () => Promise<Record<string, unknown>>;
}[] = [
  { path: "/api/ingest/tick", method: "POST", load: () => import("@/app/api/ingest/tick/route") },
  {
    path: "/api/ingest/fast-tick",
    method: "POST",
    load: () => import("@/app/api/ingest/fast-tick/route"),
  },
  {
    path: "/api/ingest/agenda",
    method: "POST",
    load: () => import("@/app/api/ingest/agenda/route"),
  },
  {
    path: "/api/ingest/venues",
    method: "POST",
    load: () => import("@/app/api/ingest/venues/route"),
  },
  {
    path: "/api/ingest/guide",
    method: "POST",
    load: () => import("@/app/api/ingest/guide/route"),
  },
  {
    path: "/api/ingest/review-tick",
    method: "POST",
    load: () => import("@/app/api/ingest/review-tick/route"),
  },
  {
    path: "/api/ingest/frontpage",
    method: "POST",
    load: () => import("@/app/api/ingest/frontpage/route"),
  },
  {
    path: "/api/ingest/source-logos",
    method: "POST",
    load: () => import("@/app/api/ingest/source-logos/route"),
  },
  {
    path: "/api/ingest/status",
    method: "GET",
    load: () => import("@/app/api/ingest/status/route"),
  },
  { path: "/api/jobs/drain", method: "POST", load: () => import("@/app/api/jobs/drain/route") },
  {
    path: "/api/jobs/revalidate",
    method: "POST",
    load: () => import("@/app/api/jobs/revalidate/route"),
  },
];

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

const call = async (r: (typeof CRON_ROUTES)[number], headers: Record<string, string>) => {
  const handler = (await r.load())[r.method] as Handler;
  return handler(new Request(`http://localhost${r.path}`, { method: r.method, headers }));
};

describe.each(CRON_ROUTES)("$method $path", (route) => {
  it.each([
    ["sem Authorization", {}],
    ["Bearer vazio", { authorization: "Bearer " }],
    ["Bearer com segredo errado", { authorization: "Bearer segredo-errado" }],
    ["Bearer com prefixo do segredo", { authorization: `Bearer ${SECRET.slice(0, -1)}` }],
    ["Bearer com o segredo mais um caractere", { authorization: `Bearer ${SECRET}x` }],
    ["esquema Basic com o segredo", { authorization: `Basic ${SECRET}` }],
    ["segredo em outro cabeçalho", { "x-cron-secret": SECRET }],
    ["bearer minúsculo", { authorization: `bearer ${SECRET}` }],
  ])("%s → 401", async (_name, headers) => {
    const res = await call(route, headers);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("CRON_SECRET ausente do ambiente recusa tudo, inclusive um Bearer qualquer (falha fechado)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const authorization of ["Bearer ", "Bearer x", `Bearer ${SECRET}`, "Bearer undefined"]) {
      expect((await call(route, { authorization })).status, authorization).toBe(401);
    }
  });

  it("query string com o segredo não autentica", async () => {
    const handler = (await route.load())[route.method] as Handler;
    const res = await handler(
      new Request(`http://localhost${route.path}?secret=${SECRET}&token=${SECRET}`, {
        method: route.method,
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("classificação de todas as rotas de src/app", () => {
  function routes(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return routes(p);
      return name === "route.ts" ? [p] : [];
    });
  }
  const found = routes("src/app").map(
    (p) => `/${relative("src/app", p).replace(/\/route\.ts$/, "")}`,
  );

  /** Cron/worker: exigem CRON_SECRET (testadas acima chamando o handler). */
  const CRON = CRON_ROUTES.map((r) => r.path);
  /** Sessão do Estúdio e papel; o e2e `security-http.spec.ts` confere 401/403/404 sem cookie. */
  const SESSION = [
    "/api/control/live",
    "/api/control/logs/export",
    "/api/control/run-now",
    "/api/estudio/midia/[id]",
    "/api/estudio/notificacoes",
    "/api/estudio/notificacoes/ler",
    "/estudio/admin/auditoria/export",
    "/estudio/admin/publicidade/relatorio/csv",
    "/estudio/admin/notificacoes/historico/exportar",
  ];
  /** Públicas de propósito (leitura anônima, validação própria, limite por IP, Origin, consentimento). */
  const PUBLIC = [
    // Anúncio (ADS-T1): contagem agregada sem identificador, deduplicada por hash de 30 min;
    // o clique é GET de propósito (302 para o anunciante) e nunca quebra se a peça sumir.
    "/api/ads/click/[id]",
    "/api/ads/view",
    "/api/alertas",
    "/api/alertas/novidades",
    "/api/ask",
    // Erro do navegador na tela "Algo deu errado": só log, 4 KB no máximo, 10 por IP a cada 10 min.
    "/api/client-error",
    "/api/editoria/[slug]/novas",
    "/api/events",
    "/api/fontes/onboarding",
    "/api/guia/informar",
    // Foto do Google do lugar (A-212): só GET, lugar público, limite diário global, 404 em falha.
    "/api/guia/foto/[slug]",
    "/api/ics/[slug]",
    "/api/materia/[slug]/atualizacao",
    "/api/media/[id]",
    "/api/newsletter",
    "/api/push/receipt",
    "/api/push/subscriptions",
    "/api/push/subscriptions/[id]",
    "/api/push/subscriptions/rotate",
    "/api/search/suggest",
    "/auth/callback",
    "/sitemap-articles.xml",
    "/sitemap-news.xml",
    "/sitemap-pages.xml",
    "/sitemap-topics.xml",
    "/sitemap.xml",
  ];

  it("toda rota tem classificação (rota nova exige decisão de segurança)", () => {
    const known = new Set([...CRON, ...SESSION, ...PUBLIC]);
    expect(found.filter((r) => !known.has(r))).toEqual([]);
    expect([...known].filter((r) => !found.includes(r))).toEqual([]);
  });

  it("rota de cron chama isCronAuthorized antes de qualquer outra coisa", () => {
    for (const r of CRON) {
      const src = readFileSync(join("src/app", r, "route.ts"), "utf8");
      expect(src, r).toContain("isCronAuthorized");
      const body = src.slice(src.search(/export async function (GET|POST)/));
      // A checagem vem antes de qualquer `await` de negócio.
      const auth = body.indexOf("isCronAuthorized");
      const firstAwait = body.indexOf("await ");
      expect(auth, r).toBeGreaterThan(-1);
      expect(firstAwait === -1 || auth < firstAwait, r).toBe(true);
    }
  });

  it("rota de sessão consulta a sessão ou o comando autorizado", () => {
    for (const r of SESSION) {
      const src = readFileSync(join("src/app", r, "route.ts"), "utf8");
      expect(/getSession|runNowCommand/.test(src), r).toBe(true);
    }
  });

  it("nenhuma rota pública usa a service role direto (só pelas camadas de banco)", () => {
    for (const r of PUBLIC) {
      const src = readFileSync(join("src/app", r, "route.ts"), "utf8");
      expect(src, r).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createServiceClient/);
    }
  });

  it("nenhuma rota de estado aceita GET para gravar (métodos exportados)", () => {
    const writers = [
      "/api/ads/view",
      "/api/alertas",
      "/api/events",
      "/api/guia/informar",
      "/api/newsletter",
      "/api/push/receipt",
      "/api/push/subscriptions",
      "/api/push/subscriptions/rotate",
      "/api/push/subscriptions/[id]",
      "/api/control/run-now",
    ];
    for (const r of writers) {
      const src = readFileSync(join("src/app", r, "route.ts"), "utf8");
      expect(src, r).not.toMatch(/export (async )?function GET\b/);
    }
  });
});
