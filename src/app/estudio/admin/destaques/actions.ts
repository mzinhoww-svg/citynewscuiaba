"use server";

import type { AdminReply, PinPayload, SearchHit } from "@/components/estudio";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { hasApprovedCover } from "@/lib/featured";
import type { StudioResult } from "@/lib/studio/action";
import {
  dismissHot,
  pinArticle,
  reorder,
  searchEligibleArticles,
  unpin,
} from "@/lib/studio/featured";

/* Server Actions dos destaques (FD-T4): camada fina sobre src/lib/studio/featured. */

function reply<O>(r: StudioResult<O>, ok: string): AdminReply {
  if (!r.ok) {
    return {
      ok: false,
      message: r.message ?? T.error[r.error === "forbidden" ? "forbidden" : "generic"],
    };
  }
  return { ok: true, message: ok };
}

export async function pinAction(i: PinPayload): Promise<AdminReply> {
  const duration =
    typeof i.duration === "object" ? { until: new Date(i.duration.until) } : i.duration;
  return reply(await pinArticle({ ...i, duration }), T.success.pinned);
}

export async function unpinAction(i: { id: string }): Promise<AdminReply> {
  return reply(await unpin(i), T.success.removed);
}

export async function dismissHotAction(i: { id: string }): Promise<AdminReply> {
  return reply(await dismissHot(i), T.success.dismissed);
}

export async function reorderAction(i: { slotKey: string; ids: string[] }): Promise<AdminReply> {
  return reply(await reorder(i), T.success.reordered);
}

export async function searchAction(q: string): Promise<SearchHit[]> {
  const found = await searchEligibleArticles(q, 10);
  return found.map((a) => ({
    id: a.id,
    title: a.title,
    sectionName: a.section.name,
    publishedAt: a.publishedAt,
    imageSrc: hasApprovedCover(a.image) ? (a.image?.src ?? null) : null,
    imageAlt: a.image?.alt ?? "",
  }));
}
