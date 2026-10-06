import { err, ok, type Result } from "@/lib/result";
import type { MediaAssetRecord, MediaRepo, Revalidate } from "@/lib/pipeline/ports";
import type { MediaStore } from "./store";
import { VARIANT_WIDTHS, variantPath } from "./variants";

export interface TakedownDeps {
  repo: MediaRepo;
  store: MediaStore;
  revalidate: Revalidate;
  now: () => Date;
}

/**
 * Remoção de reprodução a pedido (A-010, spec §6.5: em até 24 h): bloqueia o asset (sai do portal
 * na hora, RLS só mostra aprovadas), apaga a cópia do Storage (e as variantes por largura), invalida as páginas que a usavam
 * e registra na auditoria. `sourceId` remove todas as reproduções do veículo (opt-out). A URL de
 * origem continua registrada como bloqueada: o pipeline nunca volta a copiá-la.
 */
export async function takedownReproduction(
  deps: TakedownDeps,
  target: { mediaId: string } | { sourceId: string },
  actor: string,
  reason: string,
): Promise<Result<{ blocked: number; articleIds: string[] }, "reason_required" | "not_found">> {
  if (!reason.trim()) return err("reason_required");
  let assets: MediaAssetRecord[];
  if ("mediaId" in target) {
    const a = await deps.repo.asset(target.mediaId);
    if (!a) return err("not_found");
    assets = a.status === "blocked" ? [] : [a];
  } else {
    assets = await deps.repo.reproductionsOfSource(target.sourceId);
  }

  const articleIds = new Set<string>();
  for (const a of assets) {
    const { articleIds: used } = await deps.repo.blockAsset(a.id, reason.trim(), deps.now());
    used.forEach((id) => articleIds.add(id));
    await deps.store.remove(a.storagePath);
    // Variantes por largura são cópias do mesmo ativo: saem junto (item 79, CLAUDE.md §5.11).
    for (const w of VARIANT_WIDTHS) await deps.store.remove(variantPath(a.storagePath, w));
    await deps.repo.audit({
      actor,
      action: "media.takedown",
      objectRef: `media:${a.id}`,
      details: { reason: reason.trim(), kind: a.kind, originUrl: a.originUrl, articles: used },
    });
  }
  const ids = [...articleIds];
  if (ids.length > 0) await deps.revalidate(ids.map((id) => `article:${id}`));
  return ok({ blocked: assets.length, articleIds: ids });
}
