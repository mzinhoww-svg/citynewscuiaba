/**
 * Texto que a pessoa não vê, mas o modelo lê (spec §6.6; CLAUDE.md regra 6): elementos ocultos por
 * atributo ou CSS (inline e regras simples de `<style>`) saem do documento antes da extração.
 * É defesa em profundidade: o que escapar (CSS externo, técnica nova) ainda passa por
 * `sanitizeExternalText` e por `wrapAsData`; texto externo é dado, nunca instrução.
 *
 * Só funções puras sobre o DOM do `linkedom`; nada de rede (não baixamos CSS externo).
 */

/** O suficiente do DOM que usamos (o `Document` do linkedom cumpre). */
interface ElementLike {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  remove(): void;
  tagName?: string;
}
interface DocumentLike {
  querySelectorAll(selector: string): ArrayLike<ElementLike> & Iterable<ElementLike>;
}

const ZERO = /^[+-]?(?=\.?\d)0*(?:\.0+)?(?:px|em|rem|pt|%|vw|vh|ex|ch|cm|mm|in)?$/i;
/** Deslocamento para fora da tela: -100px ou mais (ou -100em/vw). */
const OFFSCREEN = /^-\s*(?:\d{3,}|\d{2,}(?:vw|vh|em|rem))/i;

function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of css.replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part
      .slice(i + 1)
      .replace(/!important/i, "")
      .trim()
      .toLowerCase();
    if (prop) out.set(prop, value);
  }
  return out;
}

function tinyBox(v: string | undefined): boolean {
  return v !== undefined && /^(?:0+(?:\.\d+)?|1)(?:px)?$/.test(v);
}

/** As declarações escondem o conteúdo de quem olha a página? */
export function declarationsHide(css: string): boolean {
  const d = declarations(css);
  const has = (prop: string, re: RegExp) => re.test(d.get(prop) ?? "");
  if (has("display", /^none$/)) return true;
  if (has("visibility", /^(?:hidden|collapse)$/)) return true;
  if (has("content-visibility", /^hidden$/)) return true;
  if (ZERO.test(d.get("opacity") ?? "x")) return true;
  const fontSize = d.get("font-size");
  if (fontSize !== undefined && ZERO.test(fontSize)) return true;
  for (const prop of ["text-indent", "left", "right", "top", "bottom", "margin-left", "margin-top"])
    if (OFFSCREEN.test(d.get(prop) ?? "")) return true;
  const overflowHidden = has("overflow", /^hidden$/) || has("overflow-x", /^hidden$/);
  if (overflowHidden) {
    for (const prop of ["height", "max-height", "width", "max-width"])
      if (tinyBox(d.get(prop))) return true;
  }
  if (has("clip", /^rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)$/))
    return true;
  if (has("clip-path", /^inset\(\s*(?:50|100)%/)) return true;
  if (has("transform", /scale\(\s*0(?:\.0+)?\s*\)/)) return true;
  if (
    has("color", /^transparent$/) ||
    has("-webkit-text-fill-color", /^transparent$/) ||
    (d.has("color") && d.get("color") === (d.get("background-color") ?? d.get("background")))
  )
    return true;
  return false;
}

interface CssRule {
  selector: string;
  body: string;
}

/**
 * Regras de um `<style>`. `@media` (exceto só `print`) e `@supports` são abertos, para o CSS
 * escondido dentro deles não escapar; outras at-rules (`@font-face`, `@keyframes`) são ignoradas.
 */
export function parseCssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const walk = (src: string, depth: number): void => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) return;
      let level = 1;
      let j = open + 1;
      while (j < src.length && level > 0) {
        if (src[j] === "{") level++;
        else if (src[j] === "}") level--;
        j++;
      }
      const head = src.slice(i, open).trim();
      const inner = src.slice(open + 1, j - 1);
      i = j;
      if (head.startsWith("@")) {
        const at = head.toLowerCase();
        const printOnly = /^@media\s+print\s*$/.test(at);
        if ((at.startsWith("@media") || at.startsWith("@supports")) && !printOnly && depth < 4)
          walk(inner, depth + 1);
        continue;
      }
      if (head) rules.push({ selector: head, body: inner });
    }
  };
  walk(text, 0);
  return rules;
}

function hiddenBySheets(document: DocumentLike): ElementLike[] {
  const hidden: ElementLike[] = [];
  for (const style of Array.from(document.querySelectorAll("style"))) {
    const css = (style as unknown as { textContent?: string | null }).textContent ?? "";
    for (const rule of parseCssRules(css)) {
      if (!declarationsHide(rule.body)) continue;
      for (const sel of rule.selector.split(",")) {
        const s = sel.trim();
        // Pseudo-elementos e estados não casam com elemento; seletor estranho é ignorado.
        if (!s || /::|:(?:hover|focus|active|visited|before|after)/i.test(s) || s.length > 200)
          continue;
        try {
          hidden.push(...Array.from(document.querySelectorAll(s)));
        } catch {
          /* seletor que o parser não entende */
        }
      }
    }
  }
  return hidden;
}

/**
 * Remove do documento tudo que está oculto: atributo `hidden`, `<input type=hidden>`, `style`
 * inline que esconde, e elementos casados por regra de `<style>` que esconde. Devolve quantos
 * elementos saíram (para métrica e teste).
 */
export function removeHiddenElements(document: DocumentLike): number {
  const targets = new Set<ElementLike>();
  for (const el of Array.from(document.querySelectorAll("[hidden]"))) targets.add(el);
  for (const el of Array.from(document.querySelectorAll('input[type="hidden" i]'))) targets.add(el);
  for (const el of Array.from(document.querySelectorAll("[style]"))) {
    if (declarationsHide(el.getAttribute("style") ?? "")) targets.add(el);
  }
  for (const el of hiddenBySheets(document)) targets.add(el);
  let removed = 0;
  for (const el of targets) {
    // `body` e `html` escondidos não fazem sentido como defesa: não esvaziam o documento.
    const tag = el.tagName?.toLowerCase();
    if (tag === "html" || tag === "body" || tag === "head") continue;
    el.remove();
    removed++;
  }
  return removed;
}
