import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFontMetrics, type FontMetrics } from "./font-metrics";

/**
 * Fontes do carrossel (Liberation Sans e Serif, SIL OFL 1.1: `fonts/LICENSE`). Lidas do disco
 * em tempo de execução: na Vercel, `outputFileTracingIncludes` (next.config.ts) leva a pasta
 * para as funções que montam o pacote, no mesmo caminho relativo à raiz do projeto.
 */
export const SOCIAL_FONTS_DIR = join(process.cwd(), "src", "lib", "social", "fonts");

export interface SocialFont {
  name: "Sans" | "Serif";
  weight: 400 | 700;
  data: Buffer;
  metrics: FontMetrics;
}

export interface SocialFonts {
  sans: SocialFont;
  sansBold: SocialFont;
  serifBold: SocialFont;
}

let cached: SocialFonts | null = null;

function load(file: string, name: SocialFont["name"], weight: SocialFont["weight"]): SocialFont {
  const data = readFileSync(join(SOCIAL_FONTS_DIR, file));
  return { name, weight, data, metrics: parseFontMetrics(new Uint8Array(data)) };
}

/** Carrega uma vez por instância. Lança se o arquivo faltar (o pacote vira `draft` com o erro). */
export function socialFonts(): SocialFonts {
  cached ??= {
    sans: load("LiberationSans-Regular.ttf", "Sans", 400),
    sansBold: load("LiberationSans-Bold.ttf", "Sans", 700),
    serifBold: load("LiberationSerif-Bold.ttf", "Serif", 700),
  };
  return cached;
}
