import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

/** Conteúdo de `src/styles/tokens.css` (lido uma vez por processo). */
function tokensCss(): string {
  if (cached === null) cached = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
  return cached;
}

/**
 * Valor de uma variável CSS declarada em `:root` de `tokens.css` (ex.: `--cn-tinta`). Serve
 * ao manifesto e aos metadados de instalação, que precisam da cor como texto no build sem
 * repetir hex no código (DESIGN.md §2). `null` quando o token não existe.
 */
export function readCssToken(name: string, css: string = tokensCss()): string | null {
  const re = new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;}]+)[;}]`);
  const m = re.exec(css);
  return m ? m[1]!.trim() : null;
}
