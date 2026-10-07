import type { MediaStore } from "./store";

/**
 * Variantes por largura da mesma imagem (item 79). São cópias reduzidas do MESMO ativo do Media
 * Registry (`media_assets`): não viram ativo novo, herdam origem, status de direitos e escopo de
 * uso do original e somem junto com ele na remoção a pedido (CLAUDE.md §5.11). Este módulo é puro
 * (sem `sharp`) para poder ser importado por componentes; a geração fica em `make-variants.ts`.
 */
export const VARIANT_WIDTHS = [480, 960, 1440] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export const VARIANT_CONTENT_TYPE = "image/webp";

/** `original/abc.jpg` → `original/abc.w480.webp` (ao lado do original, mesma chave sha256). */
export function variantPath(path: string, w: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}.w${w}.webp`;
}

/** Larguras que existem para um original: só as menores que ele (nunca amplia). */
export function variantWidthsFor(originalWidth: number): VariantWidth[] {
  return VARIANT_WIDTHS.filter((w) => w < originalWidth);
}

/**
 * `?w=` da rota: a menor variante ≥ w que exista para o original. `null` = servir o original
 * (pedido inválido, acima da maior variante, ou original estreito demais). Largura do original
 * desconhecida: tenta a variante, e a rota cai no original se ela faltar no Storage.
 */
export function pickVariantWidth(
  requested: number,
  originalWidth: number | null | undefined,
): VariantWidth | null {
  if (!Number.isFinite(requested) || requested <= 0) return null;
  const available = originalWidth ? variantWidthsFor(originalWidth) : [...VARIANT_WIDTHS];
  return available.find((w) => w >= requested) ?? null;
}

const MEDIA_ROUTE = /^\/api\/media\/[0-9a-f-]{36}$/i;

/** `srcset` da rota própria de mídia; outras imagens (ícones, URLs externas) não têm variantes. */
export function mediaSrcSet(src: string): string | undefined {
  if (!MEDIA_ROUTE.test(src)) return undefined;
  return VARIANT_WIDTHS.map((w) => `${src}?w=${w} ${w}w`).join(", ");
}

export type MakeVariants = (bytes: Uint8Array) => Promise<{ width: number; buf: Uint8Array }[]>;

/**
 * Gera e grava as variantes ao lado do original. Nunca lança: variante que falha só faz a rota
 * servir o original (fallback), e a ingestão segue.
 */
export async function saveVariants(
  store: MediaStore,
  originalPath: string,
  bytes: Uint8Array,
  make: MakeVariants,
): Promise<{ saved: number[]; failed: number[] }> {
  let variants: { width: number; buf: Uint8Array }[];
  try {
    variants = await make(bytes);
  } catch {
    return { saved: [], failed: [...VARIANT_WIDTHS] };
  }
  const saved: number[] = [];
  const failed: number[] = [];
  for (const v of variants) {
    const put = await store.put(
      variantPath(originalPath, v.width),
      new Uint8Array(v.buf),
      VARIANT_CONTENT_TYPE,
    );
    (put.ok ? saved : failed).push(v.width);
  }
  return { saved, failed };
}
