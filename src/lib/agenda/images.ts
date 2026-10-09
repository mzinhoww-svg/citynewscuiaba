/**
 * Imagem de divulgação dos eventos de uma coleta (ARD-T2, spec agenda rica §4): depois da
 * reconciliação (travas já aplicadas), cada evento a gravar com `imageUrl` e sem `mediaId` passa
 * por `deps.registerImage` (`registerExternalImage`). Teto: `MAX_IMAGES_PER_RUN` tentativas com
 * pedido HTTP por execução — recusa sem rede (host, origem bloqueada já conhecida) não gasta vaga.
 * Eventos novos primeiro; os já guardados em ordem que gira a cada execução (hash da chave com a
 * hora da coleta), para uma imagem que sempre falha não ocupar sempre a mesma vaga. Falha da
 * imagem nunca bloqueia o evento: o motivo vai para a fonte.
 */
import { createHash } from "node:crypto";
import { pastCut, type RunCtx, type SourceReport, type StoredCollected } from "./collect-context";
import type { AgendaSource, NormalizedEvent } from "./types";

/** Posição de um evento já guardado nesta execução: estável na hora, muda de uma para outra. */
const rotation = (dedupeKey: string, now: Date): string =>
  createHash("sha1")
    .update(`${dedupeKey}|${now.toISOString().slice(0, 13)}`)
    .digest("hex");

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
  const withImage = out.filter((e) => e.imageUrl !== null && e.mediaId === null);
  const fresh = withImage.filter((e) => !known.has(e.dedupeKey));
  const old = withImage
    .filter((e) => known.has(e.dedupeKey))
    .map((e) => ({ e, k: rotation(e.dedupeKey, ctx.now) }))
    .sort((a, b) => a.k.localeCompare(b.k))
    .map((x) => x.e);
  for (const e of [...fresh, ...old]) {
    if (ctx.imagesLeft <= 0 || pastCut(ctx)) break;
    const url = e.imageUrl;
    if (!url) continue;
    const source = sources.find((s) => s.id === e.sourceId);
    const report = reports.find((r) => r.id === e.sourceId);
    let reason: keyof SourceReport["imageSkipped"];
    try {
      const r = await register(
        {
          url,
          pageUrl: e.sourceUrl,
          sourceName: source?.name ?? e.sourceId,
          ...(e.imageContext
            ? { siteUrl: e.imageContext.site, cdnHosts: e.imageContext.cdnHosts }
            : {}),
        },
        () => {
          ctx.imagesLeft--;
        },
      );
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
