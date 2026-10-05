import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Modo escuro em estado interativo (UX-W1-T1, itens 1, 2 e 3 da spec de melhorias): hover,
 * nota "Corrigido", placas Tinta e themeColor.
 */

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const globals = readFileSync("src/styles/globals.css", "utf8");

/** Recorta os blocos de modo escuro (`[data-theme="dark"]` ou `prefers-color-scheme: dark`). */
function darkBlock(css: string): string {
  const out: string[] = [];
  const re = /(\[data-theme="dark"\]|prefers-color-scheme:\s*dark)[^{]*\{/g;
  while (re.exec(css)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out.join("\n");
}

/** Bloco claro: o `:root {` inicial, até o fechamento correspondente. */
function lightBlock(css: string): string {
  const start = css.indexOf(":root {");
  let depth = 1;
  let i = start + ":root {".length;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i);
}

/** Razão de contraste WCAG 2.x entre duas cores `#rrggbb`. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Arquivos `.ts`/`.tsx` (fora de testes) sob `dir` cujo conteúdo casa com `pattern`. */
function rg(pattern: RegExp, dir: string): string[] {
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        if (pattern.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    }
  };
  walk(dir);
  return hits;
}

/** Valor hex de uma variável num bloco CSS. */
function value(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1]?.toLowerCase();
}

describe("modo escuro em estado interativo", () => {
  it("tema claro define --surface-hover como Névoa 2", () => {
    expect(lightBlock(tokens)).toMatch(/--surface-hover:\s*var\(--cn-nevoa-2\)/);
  });

  it("modo escuro redefine --surface-hover e --cn-urucum-soft", () => {
    const dark = darkBlock(tokens);
    expect(dark).toMatch(/--surface-hover:\s*#1b2638/);
    expect(dark).toMatch(/--cn-urucum-soft:\s*#2e1810/);
  });

  it("contraste do texto forte sobre hover escuro ≥ 4.5", () => {
    expect(contrast("#e9edf3", "#1b2638")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#f39a78", "#2e1810")).toBeGreaterThanOrEqual(4.5);
  });

  it("texto forte, metadado e link sobre o hover escuro e a nota Corrigido ≥ 4.5 (lidos do CSS)", () => {
    const dark = darkBlock(tokens);
    const hover = value(dark, "--surface-hover");
    const soft = value(dark, "--cn-urucum-soft");
    const strong = value(dark, "--text-strong");
    const meta = value(dark, "--text-meta");
    const link = value(dark, "--text-link");
    expect([hover, soft, strong, meta, link].every(Boolean)).toBe(true);
    for (const fg of [strong!, meta!]) expect(contrast(fg, hover!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(link!, soft!)).toBeGreaterThanOrEqual(4.5);
    // Tema claro: Urucum texto sobre Urucum suave.
    const light = lightBlock(tokens);
    expect(
      contrast(value(light, "--cn-urucum-texto")!, value(light, "--cn-urucum-soft")!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("globals expõe bg-hover e o utilitário plate-edge", () => {
    expect(globals).toMatch(/--color-hover:\s*var\(--surface-hover\)/);
    expect(globals).toMatch(/@utility plate-edge\s*\{/);
  });

  it("nenhum nevoa-2 em estado interativo", () => {
    expect(rg(/(hover|aria-pressed|aria-\[current=page\]):bg-nevoa-2/, "src")).toEqual([]);
  });

  it("nenhuma classe bg-nevoa-2 solta (fundo estático vira bg-section)", () => {
    expect(rg(/\bbg-nevoa-2\b/, "src")).toEqual([]);
  });

  it("placas Tinta usam plate-edge", () => {
    for (const f of [
      "src/components/editorial/OriginLabel.tsx",
      "src/components/editorial/SiteFooter.tsx",
      "src/components/editorial/VideoLowerThird.tsx",
      "src/components/studio/push/PushPreview.tsx",
      "src/components/studio/NotificationBell.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).toContain("plate-edge");
    }
  });

  it("themeColor escuro igual a --bg-page escuro", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const bgPage = value(darkBlock(tokens), "--bg-page");
    expect(bgPage).toBe("#0b1320");
    expect(layout).toMatch(new RegExp(`prefers-color-scheme: dark\\)",\\s*color:\\s*"${bgPage}"`));
  });
});

describe("rótulo de campo em 16 px (UX-W2-T1, item 29, R9)", () => {
  it("--type-label usa o tamanho --fs-16", () => {
    expect(tokens).toMatch(/--type-label:\s*600 var\(--fs-16\)\/1\.25 var\(--font-sans\)/);
  });

  it("nenhum text-16 redundante junto de type-label (em qualquer ordem)", () => {
    expect(
      rg(/["'`][^"'`]*(\btype-label\b[^"'`]*\btext-16\b|\btext-16\b[^"'`]*\btype-label\b)/, "src"),
    ).toEqual([]);
  });

  it("título do Dialog usa papel tipográfico, não tamanho solto", () => {
    const dialog = readFileSync("src/components/ui/Dialog.tsx", "utf8");
    expect(dialog).not.toContain("text-18 font-semibold leading-snug");
    expect(dialog).toMatch(/<h2 id=\{titleId\} className="[^"]*\btype-nav-title\b/);
  });
});
