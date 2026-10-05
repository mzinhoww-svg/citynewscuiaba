import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_TONE_CLASSES, StatusBadge, type StatusTone } from "./StatusBadge";

const TONES: readonly StatusTone[] = [
  "success",
  "warn",
  "danger",
  "info",
  "neutral",
  "ai",
  "correction",
];

const EXPECTED: Record<StatusTone, readonly [bg: string, text: string]> = {
  success: ["bg-cerrado-soft", "text-service"],
  warn: ["bg-atencao-soft", "text-warn"],
  danger: ["bg-erro-soft", "text-danger"],
  info: ["bg-section", "text-strong"],
  neutral: ["bg-section", "text-meta"],
  ai: ["bg-ia-soft", "text-ai"],
  correction: ["bg-urucum-soft", "text-link"],
};

describe("StatusBadge", () => {
  it.each(TONES)("tom %s aplica o par de fundo suave e texto", (tone) => {
    const { container } = render(
      <StatusBadge tone={tone} icon="check">
        Rótulo
      </StatusBadge>,
    );
    const badge = container.querySelector(`[data-tone='${tone}']`);
    expect(badge).not.toBeNull();
    const [bg, text] = EXPECTED[tone];
    expect(badge).toHaveClass(bg, text);
  });

  it("sempre traz ícone decorativo (nunca só cor)", () => {
    const { container } = render(
      <StatusBadge tone="danger" icon="ban">
        Bloqueada
      </StatusBadge>,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Bloqueada")).toBeVisible();
  });

  it("texto de 80 caracteres não estoura: trunca e expõe o texto completo em title", () => {
    const long = "Fonte com nome comprido demais para caber no selo de status do painel editorial.";
    expect(long.length).toBeGreaterThanOrEqual(80);
    const { container } = render(
      <StatusBadge tone="info" icon="clock">
        {long}
      </StatusBadge>,
    );
    const badge = container.querySelector("[data-tone='info']");
    expect(badge).toHaveClass("max-w-full", "min-w-0");
    const label = screen.getByText(long);
    expect(label).toHaveClass("truncate", "min-w-0");
    expect(label).toHaveAttribute("title", long);
  });

  it("tamanhos sm (padrão) e md", () => {
    const { container: sm } = render(
      <StatusBadge tone="neutral" icon="archive">
        Arquivada
      </StatusBadge>,
    );
    expect(sm.querySelector("[data-tone]")).toHaveClass("text-13");
    const { container: md } = render(
      <StatusBadge tone="neutral" icon="archive" size="md">
        Arquivada
      </StatusBadge>,
    );
    expect(md.querySelector("[data-tone]")).toHaveClass("text-14");
  });
});

/* Contraste ≥ 4,5:1 de cada par nos dois temas, resolvendo os tokens de tokens.css/globals.css. */
const TOKENS = readFileSync("src/styles/tokens.css", "utf8");
const GLOBALS = readFileSync("src/styles/globals.css", "utf8");

function decls(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

function blocks(css: string, selector: RegExp): string {
  let acc = "";
  for (const m of css.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "g"))) acc += m[1];
  return acc;
}

const LIGHT = decls(blocks(TOKENS, /(?:^|\n):root/));
const DARK = new Map([...LIGHT, ...decls(blocks(TOKENS, /:root\[data-theme="dark"\]/))]);
const THEME = decls(GLOBALS);

function resolve(name: string, vars: Map<string, string>): string {
  let value = vars.get(name) ?? THEME.get(name);
  for (let i = 0; value?.startsWith("var(") && i < 10; i++) {
    const ref = /var\((--[\w-]+)\)/.exec(value)![1]!;
    value = vars.get(ref) ?? THEME.get(ref);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`token sem hex: ${name} → ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("StatusBadge · contraste dos tons", () => {
  it.each(TONES)("tom %s ≥ 4,5:1 no claro e no escuro", (tone) => {
    const [bg, text] = STATUS_TONE_CLASSES[tone].split(" ");
    const bgVar = `--color-${bg!.replace(/^bg-/, "")}`;
    const textVar = `--color-${text!.replace(/^text-/, "")}`;
    for (const vars of [LIGHT, DARK]) {
      expect(contrast(resolve(textVar, vars), resolve(bgVar, vars))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
