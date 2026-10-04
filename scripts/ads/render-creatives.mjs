#!/usr/bin/env node
/**
 * Gera as peças da casa (ADS-T3) em `public/ads/*.png`: HTML com as cores e fontes da marca
 * (tokens de src/styles/tokens.css, Schibsted Grotesk), texto ajustado ao formato e PNG em 2x
 * para ficar nítido em tela de alta densidade. Uso: `node scripts/ads/render-creatives.mjs`.
 */
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { HOUSE_MESSAGES, HOUSE_SIZES, MAX_KB, fileName } from "./creatives.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "public/ads");
// A página é `about:blank`: a fonte entra embutida (data URL), um arquivo local não carregaria.
const FONT = `data:font/woff2;base64,${(
  await readFile(path.join(ROOT, "src/app/fonts/SchibstedGrotesk-normal.woff2"))
).toString("base64")}`;

// Tokens da marca (src/styles/tokens.css): Tinta, Cerrado, Urucum, Branco.
const TONES = { tinta: "#0f1b2d", cerrado: "#1e6b52" };
const URUCUM = "#e8491d";
const BRANCO = "#ffffff";

const symbol = await readFile(path.join(ROOT, "public/brand/svg/citynews-symbol-negative.svg"), "utf8");
const wordmark = await readFile(
  path.join(ROOT, "public/brand/svg/citynews-horizontal-negative.svg"),
  "utf8",
);

function layout(w, h) {
  if (h <= 120) return "strip";
  if (h > w) return "tall";
  return "box";
}

function html(m, w, h) {
  const kind = layout(w, h);
  const bg = TONES[m.tone];
  const tiny = h <= 50;
  // Faixa estreita (celular): sem botão por extenso, só a seta; o título ganha o espaço.
  const narrow = w < 500;
  const strip = `
    <div class="strip">
      <div class="sym">${symbol}</div>
      <div class="copy">
        <p class="title fit">${m.title}</p>
        ${h >= 90 && w >= 700 ? `<p class="text fit">${m.text}</p>` : ""}
      </div>
      ${narrow ? `<span class="arrow" aria-hidden="true">→</span>` : `<span class="cta">${m.cta}</span>`}
    </div>`;
  const box = `
    <div class="box ${kind}">
      <div class="mark">${wordmark}</div>
      <div class="copy">
        ${kind === "tall" ? `<span class="rule"></span>` : ""}
        <p class="title fit">${m.title}</p>
        <p class="text fit">${m.text}</p>
      </div>
      <span class="cta">${m.cta}</span>
    </div>`;
  const pad = Math.round(Math.min(w, h) * (kind === "strip" ? 0.14 : 0.08));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @font-face { font-family: "Schibsted Grotesk"; src: url("${FONT}") format("woff2"); font-weight: 400 800; }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
    body { background: ${bg}; color: ${BRANCO}; font-family: "Schibsted Grotesk", sans-serif; }
    svg title { display: none; }
    .strip { display: flex; align-items: center; gap: ${Math.round(pad * 0.9)}px; height: 100%; padding: ${pad}px ${Math.round(pad * 1.4)}px; }
    .sym { flex: none; height: ${Math.round(h * 0.52)}px; }
    .sym svg { height: 100%; width: auto; display: block; }
    .strip .copy { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
    .strip .title { font-weight: 800; font-size: ${Math.round(h * (tiny ? 0.32 : 0.3))}px; line-height: 1.12; max-height: 100%; overflow: hidden; }
    .strip .text { font-weight: 400; font-size: ${Math.round(h * 0.2)}px; line-height: 1.25; opacity: .92; max-height: 50%; overflow: hidden; }
    .arrow { flex: none; display: grid; place-items: center; width: ${Math.round(h * (tiny ? 0.62 : 0.44))}px; height: ${Math.round(h * (tiny ? 0.62 : 0.44))}px;
      border-radius: 50%; background: ${BRANCO}; color: ${bg}; font-weight: 800; font-size: ${Math.round(h * (tiny ? 0.36 : 0.24))}px; }
    .strip .cta { flex: none; background: ${BRANCO}; color: ${bg}; font-weight: 700; border-radius: 999px;
      font-size: ${Math.max(12, Math.round(h * 0.22))}px; padding: ${tiny ? "4px 12px" : `${Math.round(h * 0.12)}px ${Math.round(h * 0.28)}px`}; white-space: nowrap; }
    .box { display: flex; flex-direction: column; height: 100%; padding: ${pad}px; gap: ${Math.round(pad * 0.7)}px; position: relative; }
    .box.tall { justify-content: space-between; }
    .tall .copy { flex: none; justify-content: flex-start; }
    .tall .title { font-size: ${Math.round(w * 0.14)}px; max-height: none; }
    .tall .text { font-size: ${Math.round(w * 0.062)}px; max-height: none; }
    .tall .rule { width: ${Math.round(w * 0.18)}px; height: ${Math.max(4, Math.round(w * 0.016))}px; background: ${URUCUM}; border-radius: 2px; }
    .mark { height: ${Math.round(h * (kind === "tall" ? 0.07 : 0.14))}px; flex: none; }
    .mark svg { height: 100%; width: auto; display: block; }
    .box .copy { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: ${kind === "tall" ? "center" : "flex-end"}; gap: ${Math.round(pad * 0.5)}px; }
    .box .title { font-weight: 800; font-size: ${Math.round(Math.min(w * 0.11, h * 0.2))}px; line-height: 1.05; letter-spacing: -0.01em; max-height: 70%; overflow: hidden; }
    .box .text { font-weight: 400; font-size: ${Math.round(Math.min(w * 0.055, h * 0.085))}px; line-height: 1.3; opacity: .92; max-height: 40%; overflow: hidden; }
    .box .cta { align-self: flex-start; background: ${BRANCO}; color: ${bg}; font-weight: 700; border-radius: 999px;
      font-size: ${Math.round(Math.min(w * 0.05, h * 0.075))}px; padding: .55em 1.2em; white-space: nowrap; }
  </style></head><body>${kind === "strip" ? strip : box}</body></html>`;
}

/** Diminui a fonte de cada `.fit` até o texto caber (sem cortar palavra). */
async function fit(page) {
  await page.evaluate(() => {
    // Folga de 15% da fonte: acentos e descendentes da Schibsted passam da caixa da linha sem
    // que o texto esteja cortado de fato.
    const over = (el, size) =>
      el.scrollHeight > el.clientHeight + size * 0.15 || el.scrollWidth > el.clientWidth + 1;
    for (const el of document.querySelectorAll(".fit")) {
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (size > 9 && over(el, size)) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    }
  });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" },
);
let worst = 0;
for (const s of HOUSE_SIZES) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
  });
  for (const m of HOUSE_MESSAGES) {
    await page.setContent(html(m, s.width, s.height), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await fit(page);
    const file = path.join(OUT, fileName(m.id, s.width, s.height));
    await page.screenshot({ path: file, type: "png", omitBackground: false });
    const kb = (await stat(file)).size / 1024;
    worst = Math.max(worst, kb);
    if (kb > MAX_KB) throw new Error(`${file}: ${kb.toFixed(0)} KB (máximo ${MAX_KB})`);
  }
  await page.close();
}
await browser.close();
console.log(
  `${HOUSE_MESSAGES.length * HOUSE_SIZES.length} peças em public/ads (maior: ${worst.toFixed(0)} KB)`,
);
