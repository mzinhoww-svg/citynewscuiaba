import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/*
 * Apoio comum das varreduras de acessibilidade (WCAG 2.2 AA): as mesmas tags, o mesmo critério
 * (0 violações serious/critical) e a mesma espera antes de medir.
 */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

/**
 * Espera fontes e animações finitas terminarem. O axe mede a cor pintada: no meio de um fade ou
 * da troca de tema o contraste sai falso (ver o comentário de `settled` em design-system.spec.ts).
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).length,
      ),
    )
    .toBe(0);
}

/** 0 violações serious/critical na página como está agora (ou só dentro de `include`). */
export async function expectNoSeriousViolations(page: Page, include?: string): Promise<void> {
  await settle(page);
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  const r = await (include ? builder.include(include) : builder).analyze();
  const bad = r.violations.filter((v) => blocking(v.impact));
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/**
 * Regras de estrutura de DESIGN.md §9 que o axe não cobra como serious/critical: um `h1` por
 * página, um `main` e tabelas com `th scope`.
 */
export async function structureFindings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const h1 = [...document.querySelectorAll("h1")].filter(visible);
    if (h1.length !== 1) out.push(`h1 visíveis: ${h1.length} (esperado 1)`);
    const main = document.querySelectorAll("main");
    if (main.length !== 1) out.push(`main: ${main.length} (esperado 1)`);
    for (const t of document.querySelectorAll("table")) {
      if (visible(t) && !t.querySelector("th[scope]"))
        out.push(
          `tabela sem th[scope]: ${t.getAttribute("aria-label") ?? t.className.slice(0, 40)}`,
        );
    }
    return out;
  });
}

/**
 * Alvos de toque abaixo de 44 px (DESIGN.md §9), fora a exceção do WCAG 2.5.8 para link no meio
 * de texto corrido e controles só para leitor de tela.
 */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 44;
    const out: string[] = [];
    const sel =
      'button, [role="button"], [role="tab"], [role="menuitem"], summary, select, input:not([type="hidden"]), textarea, a[href]';
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[hidden], [inert], [aria-hidden='true']")) continue;
      const r0 = el.getBoundingClientRect();
      if (r0.width <= 1 || r0.height <= 1) continue;
      if (el.tagName === "A" && cs.display === "inline") continue;
      // Área de toque efetiva: a caixa do <label>, o quadro do campo (pai com borda) ou o
      // pseudo-elemento `hit-area` (36 px visuais com 44 px tocáveis).
      const rect = (e: Element) => e.getBoundingClientRect();
      let w = r0.width;
      let h = r0.height;
      const label = el.closest("label");
      if (label) {
        w = Math.max(w, rect(label).width);
        h = Math.max(h, rect(label).height);
      }
      if (/^(input|select|textarea)$/i.test(el.tagName) && el.parentElement) {
        const p = rect(el.parentElement);
        w = Math.max(w, p.width);
        h = Math.max(h, p.height);
      }
      const before = getComputedStyle(el, "::before");
      if (before.position === "absolute" && before.content !== "none") {
        w = Math.max(w, parseFloat(before.width) || 0);
        h = Math.max(h, parseFloat(before.height) || 0);
      }
      const after = getComputedStyle(el, "::after");
      if (after.position === "absolute" && after.content !== "none") {
        // `card-link`: o pseudo-elemento cobre o card inteiro.
        w = Math.max(w, parseFloat(after.width) || 0);
        h = Math.max(h, parseFloat(after.height) || 0);
      }
      // Link de texto com 44 px de altura vale, mesmo estreito (ex.: "Início" da trilha).
      const textLink = el.tagName === "A" && (el.textContent ?? "").trim().length > 0;
      if ((textLink ? h : Math.min(w, h)) + 0.5 < MIN) {
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    return out;
  });
}
