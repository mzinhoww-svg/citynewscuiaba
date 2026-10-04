import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

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

describe("Button · carregamento (item 34)", () => {
  it("loading desabilita, marca aria-busy e mostra Salvando…", () => {
    render(<Button loading>Salvar</Button>);
    const b = screen.getByRole("button");
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveTextContent("Salvando…");
    expect(b).not.toHaveTextContent("Salvar");
  });

  it("loadingLabel substitui o texto padrão", () => {
    render(
      <Button loading loadingLabel="Enviando…">
        Enviar
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Enviando…");
  });

  it("sem loading não tem aria-busy", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("loading com href vira botão desabilitado, não link", () => {
    render(
      <Button href="/x" loading>
        Abrir
      </Button>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Button · variante destrutiva (item 35)", () => {
  it("destructive é sólido em bg-danger com texto on-inverse", () => {
    render(<Button variant="destructive">Apagar matéria</Button>);
    const b = screen.getByRole("button");
    expect(b.className).toMatch(/\bbg-danger\b/);
    expect(b.className).toMatch(/\btext-on-inverse\b/);
  });

  it("texto sobre o fundo destrutivo passa AA nos dois temas (lido do CSS)", () => {
    const css = readFileSync("src/styles/tokens.css", "utf8");
    const hex = (block: string, name: string) =>
      new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1];
    const darkStart = css.indexOf(':root[data-theme="dark"]');
    const light = css.slice(css.indexOf(":root {"), darkStart);
    const dark = css.slice(darkStart);
    // Claro: --text-danger aponta para --cn-erro; --text-inverse para --cn-branco.
    expect(light).toMatch(/--text-danger:\s*var\(--cn-erro\)/);
    expect(light).toMatch(/--text-inverse:\s*var\(--cn-branco\)/);
    expect(contrast(hex(light, "--cn-branco")!, hex(light, "--cn-erro")!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(hex(dark, "--text-inverse")!, hex(dark, "--text-danger")!),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
