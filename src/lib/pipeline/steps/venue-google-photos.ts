import { mergeRecord } from "@/lib/guide/merge";
import type { VenueProvider } from "@/lib/guide/providers/types";
import type { ProviderStatus, StoredVenue, VenueSyncStore, VenueUpdate } from "./venue-sync";

/**
 * Foto do Google para lugares que já estão em listas publicadas (A-212). Depois da coleta, com a
 * cota diária que sobrou, busca pelo Place ID os lugares sem `google_photo_name` e grava a foto
 * junto com os dados do Google renovados (a validade de 30 dias recomeça, como na atualização da
 * coleta). Recusa da chave ou cota estourada param o passo; outro erro só pula o lugar.
 */

export interface GooglePhotoBackfillDeps {
  /** `null` sem chave do Google. */
  google: VenueProvider | null;
  store: {
    missingGooglePhotos(limit: number): Promise<StoredVenue[]>;
    save: VenueSyncStore["save"];
  };
  /** Chamadas ao Google que ainda cabem hoje, já descontadas as feitas nesta execução. */
  callsLeft: () => number;
  now: () => Date;
}

export interface GooglePhotoBackfillReport {
  /** Consultas feitas ao Google. */
  checked: number;
  /** Lugares que ganharam foto. */
  photos: number;
  status: ProviderStatus;
}

export async function runGooglePhotoBackfill(
  deps: GooglePhotoBackfillDeps,
  opts: { limit: number },
): Promise<GooglePhotoBackfillReport> {
  const report: GooglePhotoBackfillReport = { checked: 0, photos: 0, status: "ok" };
  const google = deps.google;
  if (!google) return { ...report, status: "no_key" };
  if (deps.callsLeft() <= 0) return { ...report, status: "budget" };
  const venues = await deps.store.missingGooglePhotos(opts.limit);
  const updates: VenueUpdate[] = [];
  for (const v of venues) {
    const id = v.placeIds.google;
    if (!id) continue;
    if (deps.callsLeft() <= 0) {
      report.status = "budget";
      break;
    }
    report.checked += 1;
    const d = await google.details(id);
    if (!d.ok) {
      if (d.error === "no_key" || d.error === "unauthorized" || d.error === "rate_limited") {
        report.status = d.error === "no_key" ? "no_key" : `error:${d.error}`;
        break;
      }
      continue;
    }
    if (!d.value) continue;
    const record = mergeRecord(v, d.value);
    if (record.googlePhoto) report.photos += 1;
    updates.push({ id: v.id, record, ratingChecked: false, googleChecked: true });
  }
  if (updates.length > 0) await deps.store.save({ inserts: [], updates }, deps.now());
  return report;
}
