// Sprite dos ícones da interface (B-018): a geometria Lucide sai uma vez por página, num <svg>
// inline com <symbol id="icon-<nome>">, e cada <Icon> só referencia com <use>. Assim nenhum
// ícone vai para o JS do navegador (eram ~20 kB de código em toda página).
// Uso: node scripts/build-icon-sprite.mjs        (grava src/components/ui/icon-sprite.ts)
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ICON_MAP } from "./icon-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Conteúdo do sprite: um <symbol> por ícone, na ordem de `ICON_MAP`. */
export function buildSprite() {
  return Object.entries(ICON_MAP)
    .map(([name, exportName]) => {
      const Glyph = lucide[exportName];
      if (!Glyph) throw new Error(`lucide-react não exporta ${exportName} (${name})`);
      const svg = renderToStaticMarkup(createElement(Glyph));
      const inner = svg.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/)?.[1];
      if (inner === undefined) throw new Error(`markup inesperado para ${name}`);
      return `<symbol id="icon-${name}" viewBox="0 0 24 24">${inner}</symbol>`;
    })
    .join("");
}

export function spriteModule() {
  return `// Gerado por scripts/build-icon-sprite.mjs (pnpm icons:sprite). Não edite à mão.
export const ICON_SPRITE =
  ${JSON.stringify(buildSprite())};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(join(root, "src/components/ui/icon-sprite.ts"), spriteModule());
  console.log(`sprite: ${Object.keys(ICON_MAP).length} ícones`);
}
