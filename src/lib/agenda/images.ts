/**
 * Imagem de divulgação dos eventos de uma coleta (ARD-T2, spec agenda rica §4): depois da
 * reconciliação (travas já aplicadas), cada evento a gravar com `imageUrl` e sem `mediaId` passa
 * por `deps.registerImage` (`registerExternalImage`), no máximo `MAX_IMAGES_PER_RUN` por execução,
 * eventos novos primeiro. Falha da imagem nunca bloqueia o evento: o motivo vai para a fonte.
 */
import { pastCut, type RunCtx, type SourceReport, type StoredCollected } from "./collect-context";
import type { AgendaSource, NormalizedEvent } from "./types";

export async function attachImages(
  toSave: readonly NormalizedEvent[],
  stored: readonly StoredCollected[],
  sources: readonly AgendaSource[],
  ctx: RunCtx,
  reports: readonly SourceReport[],
): Promise<NormalizedEvent[]> {
  const out = toSave.map((e) => ({ ...e }));
  const register = ctx.deps.registerImage;
  if (!register) return out;
  const known = new Set(stored.map((s) => s.dedupeKey));
  const candidates = out
    .filter((e) => e.imageUrl !== null && e.mediaId === null)
    // Novos antes dos já guardados: imagem que falha sempre não toma a vez dos eventos novos.
    .sort((a, b) => Number(known.has(a.dedupeKey)) - Number(known.has(b.dedupeKey)));
  for (const e of candidates) {
    if (ctx.imagesLeft <= 0 || pastCut(ctx)) break;
    const url = e.imageUrl;
    if (!url) continue;
    const source = sources.find((s) => s.id === e.sourceId);
    const report = reports.find((r) => r.id === e.sourceId);
    ctx.imagesLeft--;
    let reason: keyof SourceReport["imageSkipped"];
    try {
      const r = await register({
        url,
        pageUrl: e.sourceUrl,
        sourceName: source?.name ?? e.sourceId,
        ...(e.imageContext
          ? { siteUrl: e.imageContext.site, cdnHosts: e.imageContext.cdnHosts }
          : {}),
      });
      if (r.ok) {
        e.mediaId = r.value.mediaId;
        if (report) report.images++;
        continue;
      }
      reason = r.error;
    } catch {
      reason = "erro";
    }
    if (report) report.imageSkipped[reason] = (report.imageSkipped[reason] ?? 0) + 1;
    // Flag desligada vale para a execução inteira: nenhuma outra tentativa.
    if (reason === "flag_off") break;
  }
  return out;
}
