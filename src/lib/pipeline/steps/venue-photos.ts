import { attachOfficialPhoto, type PhotoError, type VenueMediaDeps } from "@/lib/guide/venue-media";

/**
 * Passo de fotos oficiais dos lugares (GUIA-T3): para os lugares com site e sem foto, procura a
 * imagem de destaque do próprio site e a guarda pela política `reproduction` (crédito, link,
 * retirada em 24 h). Lugar sem foto oficial fica com o cartão tipográfico e a tentativa é
 * registrada para não repetir todo dia. Nada de foto do Google nem do TripAdvisor.
 */

export interface PhotoCandidate {
  id: string;
  name: string;
  website: string;
}

export interface VenuePhotoStore {
  /** Ativos, com site, sem foto e sem tentativa recente; os que estão em listas vêm primeiro. */
  venuesNeedingPhoto(before: Date, limit: number): Promise<PhotoCandidate[]>;
  markPhotoChecked(id: string, at: Date): Promise<void>;
}

export interface VenuePhotosReport {
  checked: number;
  attached: number;
  typographic: Partial<Record<PhotoError | "storage", number>>;
}

export const PHOTO_RETRY_DAYS = 30;

export async function runVenuePhotos(
  deps: VenueMediaDeps & { photos: VenuePhotoStore },
  opts: { limit?: number } = {},
): Promise<VenuePhotosReport> {
  const at = deps.now();
  const before = new Date(at.getTime() - PHOTO_RETRY_DAYS * 86_400_000);
  const todo = await deps.photos.venuesNeedingPhoto(before, opts.limit ?? 10);
  const report: VenuePhotosReport = { checked: 0, attached: 0, typographic: {} };
  for (const v of todo) {
    const r = await attachOfficialPhoto(v, deps);
    await deps.photos.markPhotoChecked(v.id, at);
    report.checked += 1;
    if (r.status === "attached") report.attached += 1;
    else report.typographic[r.reason] = (report.typographic[r.reason] ?? 0) + 1;
  }
  return report;
}
