// Capturas das rotas públicas e medições da baseline (UI-T0, plano 2026-10-02-ui-publica).
//
// Uso:
//   node scripts/shoot-public.mjs [--no-consent] [--base=http://localhost:3000] [--out=tmp/shots]
//
// Gera, para cada rota, 390x844 e 1280x900 nos esquemas claro e escuro (página inteira) em
// tmp/shots/<viewport>-<esquema>/<rota>.png, mais tmp/shots/medidas.json com as medidas da
// tabela "Antes" de docs/reports/ui-publica.md. Com --no-consent o cookie de consentimento é
// gravado antes da visita e o banner não aparece (para ver a tela sem ele); sem a opção a
// captura mostra o que um visitante novo vê. Requer o app no ar (pnpm build && pnpm start, ou
// pnpm dev) e o Chromium do Playwright.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = opt("base", process.env.SHOOT_BASE_URL ?? "http://localhost:3000");
const OUT = path.resolve(opt("out", "tmp/shots"));
const NO_CONSENT = flag("no-consent");

// As 16 rotas do inventário (as mesmas de tests/e2e/public-shots.spec.ts) mais uma matéria,
// que é onde se mede o que vem antes do h1.
const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
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
  "/como-usamos-ia",
  ARTICLE,
];
const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1280", width: 1280, height: 900, mobile: false },
];
const SCHEMES = ["light", "dark"];

const slug = (route) => (route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, ""));

// Roda no navegador: o que o leitor encontra antes do h1 da matéria. Conta cada elemento
// visível com texto próprio (item da trilha, plaqueta, rótulo, crédito), sem ícones nem separadores, que vem antes do h1 dentro de <main>.
function itemsBeforeH1() {
  const main = document.querySelector("main") ?? document.body;
  const h1 = main.querySelector("h1");
  if (!h1) return null;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const items = [];
  for (const el of main.querySelectorAll("*")) {
    if (el === h1 || h1.contains(el)) continue;
    if (!(el.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (el.contains(h1)) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    // Ícones e separadores de trilha ("/") não contam como item.
    if (ownText && text !== "/" && visible(el)) items.push(text.slice(0, 40));
  }
  return items;
}

// Fração da altura da janela ocupada pelo banner de consentimento (a região fixa).
async function bannerShare(page, viewportHeight) {
  const box = await page
    .getByRole("region", { name: /cookies|privacidade|consentimento|dados/i })
    .first()
    .boundingBox()
    .catch(() => null);
  if (!box) {
    const fixed = await page.evaluate(() => {
      const el = [...document.querySelectorAll("section, div")].find(
        (e) => getComputedStyle(e).position === "fixed" && /consentimento|privacidade|cookies/i.test(e.getAttribute("aria-label") ?? ""),
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { y: r.top, height: r.height };
    });
    if (!fixed) return null;
    return { height: fixed.height, share: fixed.height / viewportHeight };
  }
  return { height: box.height, share: box.height / viewportHeight };
}

const browser = await chromium.launch();
const medidas = { base: BASE, semConsentimento: NO_CONSENT, rotas: {} };
let falhas = 0;

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      colorScheme: scheme,
      locale: "pt-BR",
      timezoneId: "America/Cuiaba",
    });
    if (NO_CONSENT) {
      const url = new URL(BASE);
      await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", domain: url.hostname, path: "/" }]);
    }
    const page = await context.newPage();
    const dir = path.join(OUT, `${vp.name}-${scheme === "light" ? "claro" : "escuro"}`);
    await mkdir(dir, { recursive: true });
    for (const route of ROUTES) {
      try {
        const res = await page.goto(BASE + route, { waitUntil: "load", timeout: 60_000 });
        await page.waitForTimeout(800);
        const file = path.join(dir, `${slug(route)}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const key = `${vp.name}-${scheme}`;
        const m = {
          status: res?.status() ?? null,
          alturaPagina: await page.evaluate(() => document.documentElement.scrollHeight),
        };
        if (scheme === "light" && route === "/") m.bannerNaDobra = NO_CONSENT ? null : await bannerShare(page, vp.height);
        if (scheme === "light" && route === ARTICLE) m.itensAntesDoH1 = await page.evaluate(itemsBeforeH1);
        (medidas.rotas[route] ??= {})[key] = m;
        console.log("ok  ", key, route, m.alturaPagina);
      } catch (e) {
        falhas += 1;
        console.log("FALHA", vp.name, scheme, route, String(e).slice(0, 100));
      }
    }
    await context.close();
  }
}
await browser.close();
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "medidas.json"), JSON.stringify(medidas, null, 2));
console.log(`capturas em ${OUT} (${falhas} falha(s))`);
process.exit(falhas ? 1 : 0);
