// Roteiro exploratório do painel de fontes (P5-T4/FS-T9, A-026): capturas em 360, 768 e 1280 px.
//
// Uso (servidor com fixtures, pilha local no ar):
//   CRAWLER_FIXTURES=1 AI_PROVIDER=fake pnpm exec next dev -p 3500 &
//   node scripts/capture-painel-fontes.mjs [http://localhost:3500]
// Grava em docs/reports/painel-fontes/<tela>-<largura>.png. Só fixtures fictícias (`*.example`).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const BASE = process.argv[2] ?? "http://localhost:3500";
const OUT = join(process.cwd(), "docs/reports/painel-fontes");
const WIDTHS = [360, 768, 1280];
const FOLHA = "c5000000-0000-4000-8000-000000000001";
const HELENA = { email: "helena.costa@citynews.local", password: "citynews-local-123" };
const DIEGO = { email: "diego.prado@citynews.local", password: "citynews-local-123" };

mkdirSync(OUT, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function login(page, who, next) {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.7, 10.0.0.1`,
  });
  await page.goto(`${BASE}/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail", { exact: true }).fill(who.email);
  await page.getByLabel("Senha", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(`${BASE}${next}`, { timeout: 90_000 });
}

async function shot(page, name, width, opts = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}-${width}.png`), fullPage: opts.fullPage ?? true });
  console.log(`ok ${name}-${width}`);
}

// Fontes temporárias: pausada (exclusão) e com pedido de segunda aprovação.
const tagId = Math.random().toString(16).slice(2, 8);
async function temp(name, extra = {}) {
  const { data, error } = await db
    .from("sources")
    .insert({
      slug: `captura-fs9-${name}-${tagId}`,
      name: `Fonte Captura ${name} ${tagId}`,
      base_url: `https://captura-${name}-${tagId}.example/`,
      feed_url: `https://captura-${name}-${tagId}.example/feed`,
      kind: "rss",
      locality: "cuiaba",
      status: "paused",
      status_reason: "manual",
      terms_reviewed_at: new Date().toISOString(),
      ...extra,
    })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}
const paused = await temp("exclusao");
const pending = await temp("aprovacao");
const req = await db.from("approvals").insert({
  kind: "source.critical",
  target_ref: `source:${pending.id}:image_policy=reproduction`,
  requested_by: "c1000000-0000-4000-8000-000000000007",
  justification: "Acordo verbal com o veículo, confirmado por e-mail.",
});
if (req.error) throw req.error;
await db.from("sources").delete().like("base_url", "https://vozdocoxipo.example%");
await db.from("rate_limits").delete().in("bucket", ["source_analyze", "source_test"]);

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      locale: "pt-BR",
      timezoneId: "America/Cuiaba",
    });
    const page = await ctx.newPage();
    await login(page, HELENA, "/estudio/control/fontes");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await shot(page, "lista", width);

    await page.goto(`${BASE}/estudio/control/fontes?q=zzz-sem-resultado`);
    await page.getByText("Nenhuma fonte com esses filtros").waitFor();
    await shot(page, "lista-filtro-vazio", width);

    await page.goto(`${BASE}/estudio/control/fontes?status=blocked&q=zzz-sem-resultado`);
    await shot(page, "lista-filtro-bloqueadas-vazio", width, { fullPage: false });

    // Nova fonte: endereço, análise concluída (prévia, sugestões da IA, seletores) e termos.
    await page.goto(`${BASE}/estudio/control/fontes/nova`);
    await shot(page, "nova-endereco", width, { fullPage: false });
    await page.getByLabel("Endereço da fonte").fill("https://vozdocoxipo.example/");
    await page.getByRole("button", { name: "Analisar" }).click();
    await page.getByRole("list", { name: "Prévia dos últimos itens" }).waitFor({ timeout: 60_000 });
    await shot(page, "nova-analise-previa-sugestoes", width);
    await page.getByRole("button", { name: "Usar sugestão da IA para Editorias" }).click();
    await shot(page, "nova-sugestao-aplicada", width, { fullPage: false });
    await page.getByRole("button", { name: "Continuar" }).first().click();
    await shot(page, "nova-termos", width, { fullPage: false });

    await page.goto(`${BASE}/estudio/control/fontes/nova`);
    await page.getByLabel("Endereço da fonte").fill("https://proibido.example/noticias");
    await page.getByRole("button", { name: "Analisar" }).click();
    await page.getByRole("alert").filter({ hasText: "proibido.example" }).waitFor({ timeout: 60_000 });
    await shot(page, "nova-erro-robots", width, { fullPage: false });

    for (const [slug, sub] of [
      ["visao-geral", ""],
      ["configuracao", "/configuracao"],
      ["coleta", "/coleta"],
      ["recomendacao", "/recomendacao"],
      ["historico", "/historico"],
      ["itens", "/itens"],
    ]) {
      await page.goto(`${BASE}/estudio/control/fontes/${FOLHA}${sub}`);
      await page.locator("main").waitFor();
      await shot(page, `detalhe-${slug}`, width);
    }

    await page.goto(`${BASE}/estudio/control/fontes/${paused.id}`);
    await page.getByRole("button", { name: "Excluir fonte" }).click();
    await page.getByRole("dialog").waitFor();
    await shot(page, "dialogo-exclusao", width, { fullPage: false });

    await page.goto(`${BASE}/estudio/control/fontes/${pending.id}`);
    await shot(page, "detalhe-com-pedido-pendente", width);
    await ctx.close();

    // Quem aprova é outra pessoa: Diego pediu, Helena decide (aqui, o diálogo de pedido).
    const ctx2 = await browser.newContext({ viewport: { width, height: 900 }, locale: "pt-BR" });
    const p2 = await ctx2.newPage();
    await login(p2, HELENA, `/estudio/control/fontes/${pending.id}`);
    await p2.getByRole("button", { name: "Ver pedido" }).click();
    await p2.getByRole("dialog").waitFor();
    await shot(p2, "dialogo-pedido-aprovacao", width, { fullPage: false });
    await ctx2.close();

    // Erro: fonte que não existe.
    const ctx3 = await browser.newContext({ viewport: { width, height: 900 }, locale: "pt-BR" });
    const p3 = await ctx3.newPage();
    await login(p3, DIEGO, "/estudio/control/fontes");
    await p3.goto(`${BASE}/estudio/control/fontes/00000000-0000-4000-8000-000000000000`);
    await p3.locator("main").waitFor();
    await shot(p3, "detalhe-nao-encontrada", width, { fullPage: false });
    await ctx3.close();
  }
} finally {
  await browser.close();
  for (const s of [paused, pending]) {
    await db.from("approvals").delete().like("target_ref", `source:${s.id}:%`);
    await db.from("sources").delete().eq("id", s.id);
  }
}
