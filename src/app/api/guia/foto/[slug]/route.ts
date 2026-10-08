import { googlePhotoNameFor } from "@/lib/db/guide-google-photo";
import { googlePhotoDailyLimit, serveGooglePhoto } from "@/lib/guide/google-photo";
import { googlePlacesKey } from "@/lib/guide/providers/google";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Foto principal do Google de um lugar do Guia (A-212): busca no Google com a chave do servidor e
 * repassa os bytes, sem guardar o arquivo. Limite diário global (`GUIDE_GOOGLE_PHOTO_DAILY`);
 * qualquer falha é 404. A lógica fica em `src/lib/guide/google-photo.ts`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return serveGooglePhoto(slug, {
    photoName: googlePhotoNameFor,
    allow: () => checkRateLimit("guide-photo", googlePhotoDailyLimit(process.env), 86_400),
    apiKey: googlePlacesKey(process.env),
    fetch: (url, init) => fetch(url, init),
    log: (m) => console.warn(m),
  });
}
