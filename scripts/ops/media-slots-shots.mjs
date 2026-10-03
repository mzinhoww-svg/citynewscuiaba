#!/usr/bin/env node
// Prints das posições de mídia (docs/media-slots.md): home, editoria cidade, matéria, agenda e
// pergunte em 390 e 1280 px, com overlay injetado por script (o código do app não é tocado).
//
//   BASE_URL=http://localhost:3000 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//     node scripts/ops/media-slots-shots.mjs [slug-da-matéria]
//
// Legenda: vermelho tracejado com rótulo vermelho = EXISTE no código; vermelho tracejado com
// rótulo âmbar = PLANEJADO (banners-padrão ADS-T1..T4, ainda não implementado); cinza tracejado =
// VETADO (a regra proíbe anúncio ali). Nada é gravado no app: o overlay vive só na página da captura.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../../docs/reports/media-slots/", import.meta.url).pathname;
const ARTICLE = process.argv[2] ?? "qualidade-do-ar-em-cuiaba-fica-ruim-pelo-terceiro-dia";
mkdirSync(OUT, { recursive: true });

/**
 * Cada slot: id, status ("exists" | "planned" | "vetoed"), tamanho por breakpoint e âncora.
 * Âncora: { sel, where: "after" | "before" | "over" | "tickerBottom" | "fixedBottom", nth?, textMatch? }
 * `d` = 1280, `m` = 390; tamanho null = o slot não existe nesse breakpoint.
 */
const PAGES = [
  {
    name: "home",
    path: "/",
    slots: [
      { id: "TOP", status: "planned", d: [970, 250], m: [320, 100], at: { where: "tickerBottom" } },
      { id: "RAIL-A", status: "planned", d: [300, 250], m: null, at: { sel: "NOWLIST", where: "over", align: "right" } },
      { id: "RAIL-B", status: "planned", d: [300, 600], m: null, at: { sel: "NOWLIST", where: "after", align: "right" } },
      { id: "MID-1", status: "planned", d: [970, 120], m: [320, 100], at: { sel: "#home-topics", where: "after", closest: "section" } },
      { id: "HUB", status: "planned", d: [970, 220], m: [320, 220], at: { sel: "[role=tablist]", where: "after", parent: true } },
      { id: "STICKY", status: "planned", d: null, m: [320, 50], at: { where: "fixedBottom" } },
      { id: "NATIVE-HOME-MAISLIDAS", status: "exists", d: [1120, 96], m: [342, 96], at: { sel: "section[aria-labelledby=home-most-read] ol", where: "after" } },
    ],
  },
  {
    name: "editoria-cidade",
    path: "/cidade?periodo=30d",
    slots: [
      { id: "TOP", status: "planned", d: [970, 250], m: [320, 100], at: { where: "tickerBottom" } },
      { id: "RAIL-A", status: "planned", d: [300, 250], m: [320, 100], at: { sel: "aside[aria-labelledby=mais-lidas]", where: "before", align: "right" } },
      { id: "RAIL-B", status: "planned", d: [300, 600], m: null, at: { sel: "aside[aria-labelledby=mais-lidas]", where: "after", align: "right" } },
      { id: "NATIVE-LIST-CARD", status: "planned", d: [540, 120], m: [342, 120], at: { sel: "#lista > li", nth: 6, where: "after" } },
      { id: "STICKY", status: "planned", d: null, m: [320, 50], at: { where: "fixedBottom" } },
    ],
  },
  {
    name: "materia",
    path: `/materia/${ARTICLE}`,
    slots: [
      { id: "ART-1", status: "planned", d: [728, 90], m: [320, 100], at: { sel: ".reading-body > p", nth: 4, where: "after" } },
      { id: "ART-2", status: "planned", d: [728, 250], m: [300, 250], at: { sel: "#semelhantes", where: "before", closest: "section" } },
      { id: "RAIL-A", status: "planned", d: [300, 250], m: null, at: { sel: "#materia + aside", where: "over", align: "right" } },
      { id: "STICKY", status: "planned", d: null, m: [320, 50], at: { where: "fixedBottom" } },
      { id: "NATIVE-ARTICLE-LABEL", status: "exists", d: [420, 70], m: [342, 70], at: { sel: "#materia header > div:last-child", where: "over" } },
    ],
  },
  {
    name: "agenda",
    path: "/agenda",
    slots: [
      { id: "AGENDA-RAIL-A", status: "planned", d: [300, 250], m: null, at: { sel: "main aside", where: "after", nth: 1, align: "right" }, note: "candidato, fora da spec" },
      { id: "STICKY", status: "planned", d: null, m: [320, 50], at: { where: "fixedBottom" } },
    ],
  },
  {
    name: "pergunte",
    path: "/pergunte?q=qualidade%20do%20ar",
    slots: [
      { id: "ASK-SEM-ANUNCIO", status: "vetoed", d: "el", m: "el", at: { text: /^resposta do citynews/i, where: "over", closest: "div" }, note: "regra: nunca em respostas" },
    ],
  },
];

/** Roda dentro da página: desenha as molduras. */
function overlay({ slots, vw, vh }) {
  const mobile = vw < 700;
  const COLORS = {
    exists: { border: "#d10000", label: "#d10000", text: "#fff", fill: "rgba(209,0,0,.06)" },
    planned: { border: "#d10000", label: "#ffb000", text: "#111", fill: "rgba(255,176,0,.14)" },
    vetoed: { border: "#555", label: "#555", text: "#fff", fill: "rgba(80,80,80,.10)" },
  };
  const doc = document.documentElement;
  const abs = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, r: r.right + scrollX, b: r.bottom + scrollY };
  };
  const find = (at) => {
    if (at.sel === "NOWLIST") {
      return [...document.querySelectorAll("main section")].find((s) => /^agora\b/i.test(s.querySelector("h2")?.textContent?.trim() ?? ""));
    }
    if (at.text) {
      const hit = [...document.querySelectorAll("main *")].find((e) => e.children.length === 0 && at.text.test(e.textContent.trim()));
      return hit ? (at.closest ? hit.closest(at.closest) : hit) : null;
    }
    let list = [...document.querySelectorAll(at.sel)];
    // Menos itens que `nth` (seed local pequeno): usa o último e a legenda continua valendo.
    let el = list[(at.nth ?? 1) - 1] ?? list[list.length - 1] ?? (at.fallbackSel ? document.querySelector(at.fallbackSel) : null);
    if (el && at.closest) el = el.closest(at.closest) ?? el;
    if (el && at.parent) el = el.parentElement;
    return el;
  };
  const container = document.querySelector("main");
  const cr = abs(container);
  const wrap = document.createElement("div");
  wrap.id = "__media_overlay";
  wrap.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;font:700 12px/1.2 system-ui,sans-serif";
  const missing = [];
  const draw = (s, x, y, w, h) => {
    const c = COLORS[s.status];
    const b = document.createElement("div");
    b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border:3px dashed ${c.border};background:${c.fill}`;
    const l = document.createElement("div");
    const tag = s.status === "exists" ? "EXISTE" : s.status === "vetoed" ? "VETADO" : "PLANEJADO";
    l.textContent = `${s.id} · ${w}×${h} · ${tag}${s.note ? " · " + s.note : ""}`;
    l.style.cssText = `position:absolute;left:0;top:0;max-width:100%;padding:3px 6px;background:${c.label};color:${c.text};white-space:normal`;
    b.appendChild(l);
    wrap.appendChild(b);
  };
  for (const s of slots) {
    const size = mobile ? s.m : s.d;
    if (!size) continue;
    const el0 = size === "el" ? find(s.at) : null;
    if (size === "el" && !el0) {
      missing.push(s.id);
      continue;
    }
    let [w, h] = size === "el" ? [Math.round(abs(el0).w), Math.round(abs(el0).h)] : size;
    if (s.status === "exists" || s.status === "vetoed") w = Math.min(w, Math.round(cr.w));
    const at = s.at;
    if (at.where === "fixedBottom") {
      // Acima da barra inferior do mobile (BottomNav), no rodapé da primeira tela.
      const nav = document.querySelector("nav[aria-label]:last-of-type");
      const navH = mobile ? 64 : 0;
      draw(s, Math.round((vw - w) / 2), vh - navH - h - 8, w, h);
      continue;
    }
    if (at.where === "tickerBottom") {
      const main = document.querySelector("main");
      let p = main?.previousElementSibling;
      while (p && p.getBoundingClientRect().height < 20) p = p.previousElementSibling;
      const r = p ? abs(p) : { b: 120 };
      draw(s, Math.round(Math.max(cr.x, (vw - w) / 2)), Math.round(r.b + 8), w, h);
      continue;
    }
    const el = find(at);
    if (!el) {
      missing.push(s.id);
      continue;
    }
    const r = abs(el);
    const gap = 12;
    const x = at.align === "right" ? Math.round(r.r - w) : Math.round(r.x);
    let y = r.y;
    if (at.where === "after") y = r.b + gap;
    else if (at.where === "before") y = r.y - h - gap;
    draw(s, x, Math.max(0, Math.round(y)), w, h);
  }
  const legend = document.createElement("div");
  legend.style.cssText = "position:absolute;left:8px;top:8px;background:#fff;color:#111;border:2px solid #111;padding:6px 8px;font:600 11px/1.35 system-ui,sans-serif;width:max-content;max-width:" + (vw - 24) + "px";
  legend.innerHTML = "Legenda: <span style='color:#d10000'>vermelho = existe no código</span> · <span style='background:#ffb000;padding:0 3px'>âmbar = planejado (ADS-T1..T4)</span> · <span style='color:#555'>cinza = vetado</span>";
  wrap.appendChild(legend);
  document.body.appendChild(wrap);
  return missing;
}

const browser = await chromium.launch();
try {
  for (const vw of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width: vw, height: vw === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
      locale: "pt-BR",
    });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.goto(BASE + p.path, { waitUntil: "networkidle" });
      // Rola a página para disparar o que carrega sob demanda, depois volta ao topo.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      // Viewport do tamanho da página: nada reflui entre medir e capturar (min-h-dvh, fixos).
      const vh = vw === 390 ? 844 : 900;
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: vw, height: full });
      await page.waitForTimeout(500);
      const missing = await page.evaluate(overlay, { slots: p.slots, vw, vh });
      const file = `${OUT}${p.name}-${vw}.png`;
      await page.screenshot({ path: file });
      console.log(`${file}${missing.length ? "  (âncora ausente: " + missing.join(", ") + ")" : ""}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
