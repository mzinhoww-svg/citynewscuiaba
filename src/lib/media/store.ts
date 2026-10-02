import type { Result } from "@/lib/result";

/**
 * Onde ficam as cópias das imagens (ADR-009: bucket privado `media`). Produção: Supabase Storage
 * (`src/lib/db/media-store.ts`). A pilha local sem Docker não tem Storage (A-017): testes e
 * desenvolvimento local usam `createMemoryMediaStore`.
 */
export interface MediaStore {
  readonly kind: "supabase" | "memory";
  /** Grava (ou regrava) o arquivo em `path`. Idempotente pelo caminho. */
  put(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Result<{ path: string }, string>>;
  /** Apaga o arquivo; apagar o que não existe não é erro. */
  remove(path: string): Promise<Result<void, string>>;
  /**
   * URL assinada curta do bucket privado (ADR-009). Opcional: o Storage em memória não tem e a
   * rota de mídia serve os bytes direto.
   */
  signedUrl?(path: string, expiresInSec: number): Promise<Result<string, string>>;
  /** Lê o arquivo (rota de mídia sem URL assinada). */
  read(path: string): Promise<Result<{ bytes: Uint8Array; contentType: string }, string>>;
}

/** Caminho da cópia: `<tipo>/<sha256>.<ext>` (mesmo arquivo = mesmo caminho). */
export function mediaPath(
  kind: "original" | "reproduction",
  sha256: string,
  format: string,
): string {
  const folder = kind === "reproduction" ? "reproducao" : "original";
  const ext = format === "jpeg" ? "jpg" : format;
  return `${folder}/${sha256}.${ext}`;
}

/** Storage em memória (testes e pilha local). */
export function createMemoryMediaStore(opts: { failPut?: boolean } = {}) {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store: MediaStore = {
    kind: "memory",
    async put(path, bytes, contentType) {
      if (opts.failPut) return { ok: false, error: "storage indisponível" };
      files.set(path, { bytes: new Uint8Array(bytes), contentType });
      return { ok: true, value: { path } };
    },
    async remove(path) {
      files.delete(path);
      return { ok: true, value: undefined };
    },
    async read(path) {
      const f = files.get(path);
      return f
        ? { ok: true, value: { bytes: new Uint8Array(f.bytes), contentType: f.contentType } }
        : { ok: false, error: "arquivo não encontrado" };
    },
  };
  return Object.assign(store, { files });
}
