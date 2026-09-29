import { err, ok, type Result } from "@/lib/result";
import type { MediaAssetRecord, MediaRepo, Revalidate } from "@/lib/pipeline/ports";
import type { MediaStore } from "./store";

export interface TakedownDeps {
  repo: MediaRepo;
  store: MediaStore;
  revalidate: Revalidate;
  now: () => Date;
}

/**
 * Remoção de reprodução a pedido (A-010, spec §6.5: em até 24 h): bloqueia o asset (sai do portal
 * na hora, RLS só mostra aprovadas), apaga a cópia do Storage, invalida as páginas que a usavam
 * e registra na auditoria. `sourceId` remove todas as reproduções do veículo (opt-out). A URL de
 * origem continua registrada como bloqueada: o pipeline nunca volta a copiá-la.
 */
export async function takedownReproduction(
  deps: TakedownDeps,
  target: { mediaId: string } | { sourceId: string; retry?: boolean },
  actor: string,
  reason: string,
): Promise<
  Result<{ blocked: number; articleIds: string[]; failed: number }, "reason_required" | "not_found">
> {
  if (!reason.trim()) return err("reason_required");
  let assets: MediaAssetRecord[];
  if ("mediaId" in target) {
    const a = await deps.repo.asset(target.mediaId);
    if (!a) return err("not_found");
    assets = a.status === "blocked" ? [] : [a];
  } else {
    // `retry`: repete um opt-out que falhou no meio; inclui as já bloqueadas para apagar o arquivo.
    assets = await deps.repo.reproductionsOfSource(target.sourceId, target.retry === true);
  }

  const articleIds = new Set<string>();
  let failed = 0;
  // Uma falha em um asset não interrompe os demais: cada um é bloqueado (sai do portal) e depois
  // tem o arquivo apagado; o que falhar é contado e pode ser repetido (`retry`).
  for (const a of assets) {
    try {
      if (a.status !== "blocked") {
        const { articleIds: used } = await deps.repo.blockAsset(a.id, reason.trim(), deps.now());
        used.forEach((id) => articleIds.add(id));
        await deps.repo.audit({
          actor,
          action: "media.takedown",
          objectRef: `media:${a.id}`,
          details: { reason: reason.trim(), kind: a.kind, originUrl: a.originUrl, articles: used },
        });
      }
      const removed = await deps.store.remove(a.storagePath);
      if (!removed.ok) failed++;
    } catch {
      failed++;
    }
  }
  const ids = [...articleIds];
  if (ids.length > 0) await deps.revalidate(ids.map((id) => `article:${id}`));
  // `blocked`: reproduções tratadas nesta chamada (bloqueadas agora ou só com o arquivo apagado).
  return ok({ blocked: assets.length, articleIds: ids, failed });
}
