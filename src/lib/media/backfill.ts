/**
 * Variantes por largura das imagens antigas (A-155). As novas já nascem com 480/960/1440; as que
 * vieram antes do deploy de 07/10 ficaram só com o original. Roda em lotes pela rota
 * `/api/jobs/media-variants` (a chave de serviço só existe no ambiente de produção).
 * Variante é cópia reduzida do MESMO ativo: não cria ativo nem muda direitos (§5.11).
 */
import type { MediaStore } from "./store";
import { VARIANT_CONTENT_TYPE, variantPath, type MakeVariants } from "./variants";

export interface BackfillAsset {
  id: string;
  storagePath: string;
}

export interface BackfillDeps {
  /** Ativos não bloqueados, em ordem estável, a partir de `offset`. */
  page: (offset: number, limit: number) => Promise<BackfillAsset[]>;
  store: Pick<MediaStore, "read" | "put">;
  make: MakeVariants;
}

export interface BackfillReport {
  assets: number;
  complete: number;
  written: number;
  failed: number;
  unreadable: number;
  /** `null` quando a página veio incompleta: acabou. */
  nextOffset: number | null;
}

/**
 * Um lote: ativo cuja variante de 480 já existe conta como completo (as três são gravadas juntas);
 * os outros têm o original lido e as variantes gravadas. Nunca apaga nada.
 */
export async function backfillVariants(
  deps: BackfillDeps,
  offset: number,
  limit: number,
): Promise<BackfillReport> {
  const page = await deps.page(offset, limit);
  const r: BackfillReport = {
    assets: page.length,
    complete: 0,
    written: 0,
    failed: 0,
    unreadable: 0,
    nextOffset: page.length < limit ? null : offset + page.length,
  };
  for (const a of page) {
    const small = await deps.store.read(variantPath(a.storagePath, 480));
    if (small.ok) {
      r.complete += 1;
      continue;
    }
    const original = await deps.store.read(a.storagePath);
    if (!original.ok) {
      r.unreadable += 1;
      continue;
    }
    let variants: { width: number; buf: Uint8Array }[];
    try {
      variants = await deps.make(original.value.bytes);
    } catch {
      variants = [];
    }
    if (variants.length === 0) {
      // Imagem menor que 480 px ou ilegível: a rota serve o original (fallback).
      r.unreadable += 1;
      continue;
    }
    for (const v of variants) {
      const put = await deps.store.put(
        variantPath(a.storagePath, v.width),
        new Uint8Array(v.buf),
        VARIANT_CONTENT_TYPE,
      );
      if (put.ok) r.written += 1;
      else r.failed += 1;
    }
  }
  return r;
}
