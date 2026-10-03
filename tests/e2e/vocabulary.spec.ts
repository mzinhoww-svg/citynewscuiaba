import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

/*
 * UI-T3: vocabulário público (spec 2026-10-02 §4.1). Nenhuma tela pública mostra "normalizado",
 * "IA", "inteligência artificial", "resumo por IA", "publicado automaticamente" nem "gerado por
 * IA", nem no texto visível, nem em aria-label, alt, title ou placeholder. Exceção: páginas legais
 * e a página /como-usamos-ia (conteúdo legal sobre o uso de IA permanece).
 */
const FORBIDDEN =
  /normaliz|\bagente\b|\bIA\b|inteligência artificial|resumo por ia|publicado automaticamente|gerad[oa] por ia/i;

const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const TOPIC = "/assunto/plano-de-onibus-cpa-centro";

const ROUTES = [
  "/",
  "/cidade",
  "/busca?q=prefeitura",
  "/pergunte",
  "/fontes",
  "/panorama",
  "/agenda",
  "/explorar",
  "/assuntos",
  "/favoritos",
  "/alertas",
  "/newsletter",
  "/entrar",
  "/perfil",
  "/sobre",
  ARTICLE,
  `${ARTICLE}/historico`,
  TOPIC,
  "/anuncie",
  "/app",
  "/contato",
  "/correcoes",
  "/direito-de-resposta",
  "/criar-conta",
  "/cidade?origem=normalizado",
];

/** Páginas legais: o vocabulário legal sobre o uso de IA fica como está. */
const ALLOWLIST = new Set([
  "/privacidade",
  "/termos",
  "/metodologia",
  "/principios-editoriais",
  "/como-usamos-ia",
]);

async function visibleStrings(page: Page): Promise<string[]> {
  const body = await page.innerText("body");
  const attrs = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll("[aria-label],[alt],[title],[placeholder]"),
    )) {
      for (const name of ["aria-label", "alt", "title", "placeholder"]) {
        const v = el.getAttribute(name);
        if (v) out.push(v);
      }
    }
    return out;
  });
  return [body, ...attrs];
}

function hits(strings: string[]): string[] {
  const found = new Set<string>();
  const re = new RegExp(FORBIDDEN.source, "gi");
  for (const s of strings) {
    for (const m of s.matchAll(re)) {
      const i = m.index ?? 0;
      found.add(s.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, " "));
    }
  }
  return [...found];
}

for (const route of ROUTES) {
  test(`vocabulário público limpo em ${route}`, async ({ page }) => {
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    expect(hits(await visibleStrings(page)), `ocorrências em ${route}`).toEqual([]);
  });
}

test("rota inexistente (erro 404) também não usa o vocabulário proibido", async ({ page }) => {
  await page.goto("/rota-que-nao-existe-ui-t3");
  expect(hits(await visibleStrings(page))).toEqual([]);
});

test("busca vazia e sem resultado não usam o vocabulário proibido", async ({ page }) => {
  for (const url of ["/busca", "/busca?q=zzzzqxj"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(hits(await visibleStrings(page)), url).toEqual([]);
  }
});

test("Perguntar ao CityNews: resposta com fontes e recusa por falta de fontes", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/pergunte?q=O que aconteceu em Cuiabá hoje?");
  await expect(page.getByRole("heading", { name: "Resposta do CityNews" })).toBeVisible();
  expect(hits(await visibleStrings(page)), "resposta").toEqual([]);
  await page.goto("/pergunte?q=Resuma saúde pública no Coxipó");
  await expect(
    page.getByRole("heading", { name: /Não encontramos fontes suficientes/ }),
  ).toBeVisible();
  expect(hits(await visibleStrings(page)), "recusa").toEqual([]);
});

test("a allowlist cobre só as páginas legais", () => {
  expect([...ALLOWLIST].sort()).toEqual([
    "/como-usamos-ia",
    "/metodologia",
    "/principios-editoriais",
    "/privacidade",
    "/termos",
  ]);
  for (const route of ROUTES) expect(ALLOWLIST.has(route)).toBe(false);
});
