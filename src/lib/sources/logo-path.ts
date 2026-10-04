import { createHash } from "node:crypto";

export const LOGO_BUCKET = "source-logos";

/** Caminho no bucket `source-logos`: `<id da fonte>/<hash do conteúdo>.<ext>` (cache seguro). */
export function logoObjectPath(
  sourceId: string,
  bytes: Uint8Array,
  contentType: "image/png" | "image/webp",
): string {
  const ext = contentType === "image/png" ? "png" : "webp";
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  return `${sourceId}/${hash}.${ext}`;
}

/** URL pública de um logotipo gravado; sem caminho ou sem URL do Supabase, `undefined`. */
export function sourceLogoUrl(
  path: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | undefined {
  if (!path || !supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}
