import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";

/*
 * UI-T3 e LAB-T1: vocabulário público (spec 2026-10-02 §4.1; spec 2026-10-03 R16 e R17). Nenhuma
 * tela pública diz que o conteúdo é revisado, gerado ou tratado por IA: nada de "normalizado",
 * "IA", "inteligência artificial", "resumo por IA", "publicado automaticamente", "gerado",
 * "revisado", "automático", "manipulado", "agente" nem "autonomia", e os selos de estado do assunto
 * "Em apuração", "Confirmado", "Encerrado" e "Corrigido" ficam só no Estúdio (R34). Vale para o
 * texto visível, aria-label, alt, title, placeholder e para `<title>`, `<meta>` e JSON-LD.
 * O nível de confiança (CONF-T1, R13) também não aparece: fica só no Estúdio.
 * Exceção: páginas legais (termos, privacidade, princípios).
 */
const FORBIDDEN = new RegExp(
  [
    "normaliz",
    "\\bagente\\b",
    "\\bIA\\b",
    "inteligência artificial",
    "resumo por ia",
    "publicad[oa] automaticamente",
    "gerad[oa]s?\\b",
    "revisad[oa]s?\\b",
    "automaticamente",
    "automátic[oa]s?\\b",
    "manipulad",
    "autonomia",
    "confian[cç]a",
  ].join("|"),
  "i",
);
/** Selos de estado do assunto (R16): com maiúscula, para não pegar "ainda não confirmado". */
const STATE_BADGES = /\b(Em apuração|Confirmados?|Encerrados?)\b/;

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
  "/assuntos?situacao=em-apuracao",
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
const ALLOWLIST = new Set(["/privacidade", "/termos", "/principios-editoriais"]);

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
  const head = await page.evaluate(() => {
    const out: string[] = [document.title];
    for (const m of Array.from(document.querySelectorAll("meta[content]")))
      out.push(m.getAttribute("content") ?? "");
    for (const j of Array.from(document.querySelectorAll('script[type="application/ld+json"]')))
      out.push(j.textContent ?? "");
    return out;
  });
  return [body, ...attrs, ...head];
}

function hits(strings: string[]): string[] {
  const found = new Set<string>();
  const res = [new RegExp(FORBIDDEN.source, "gi"), new RegExp(STATE_BADGES.source, "g")];
  for (const s of strings) {
    for (const re of res) {
      for (const m of s.matchAll(re)) {
        const i = m.index ?? 0;
        found.add(s.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, " "));
      }
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

test("matéria: painel 'De onde veio', sem 'Como esta matéria foi feita', sem selo de estado", async ({
  page,
}) => {
  await page.goto(ARTICLE);
  await expect(page.getByRole("region", { name: "De onde veio" }).first()).toBeAttached();
  await expect(page.getByText("Como esta matéria foi feita")).toHaveCount(0);
  await expect(page.getByText("Quem revisou")).toHaveCount(0);
  await expect(page.locator("[data-state]")).toHaveCount(0);
  const res = await page.request.get(ARTICLE);
  expect(res.status()).toBe(200);
});

test("assunto: sem apuração, confiança, convergência nem placeholder, e sem 'Carregando' no HTML inicial", async ({
  request,
}) => {
  const html = await (await request.get(TOPIC)).text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const term of [
    /apuração/i,
    /confiança|confianca/i,
    /Nada registrado/,
    /As fontes divergem|As fontes concordam/,
    /Ainda não confirmado/,
    /Carregando/,
  ])
    expect(text, String(term)).not.toMatch(term);
  expect(html).toContain("Seguir");
});

test("a allowlist cobre só as páginas legais", () => {
  expect([...ALLOWLIST].sort()).toEqual(["/principios-editoriais", "/privacidade", "/termos"]);
  for (const route of ROUTES) expect(ALLOWLIST.has(route)).toBe(false);
});
