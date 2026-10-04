import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "font", className: "font" }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

describe("layout raiz · viewport (UX-W1-T7, item 15)", () => {
  it("cobre a tela inteira do iPhone (viewport-fit=cover), com a área segura no cabeçalho", async () => {
    const { viewport } = await import("./layout");
    expect(viewport.viewportFit).toBe("cover");
  });
});

/** Arquivos .tsx de uma pasta, recursivamente. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") && !path.includes(".test.") ? [path] : [];
  });
}

describe("colunas fixas do portal (UX-W1-T7, item 14)", () => {
  it("nenhuma coluna sticky pública usa um topo solto (lg:top-6, lg:top-24, lg:top-40)", () => {
    const files = [
      ...tsxFiles(join(process.cwd(), "src/app/(public)")),
      join(process.cwd(), "src/components/editorial/DocPage.tsx"),
      join(process.cwd(), "src/components/ai/AskChat.tsx"),
    ];
    const offenders = files.filter((f) =>
      /lg:sticky[^"]*lg:top-(?:6|24|40)\b|lg:top-(?:6|24|40)\b[^"]*lg:sticky/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("o cabeçalho público declara a área segura do topo", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/editorial/SiteHeader.tsx"),
      "utf8",
    );
    expect(src).toContain("pt-safe-top");
  });
});
