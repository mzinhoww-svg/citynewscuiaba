"use server";

import type { AdminReply } from "@/components/estudio";
import { GUIDE_ADMIN_TEXT as T } from "@/content/pt-BR/guide";
import type { StudioResult } from "@/lib/studio/action";
import {
  adjustListCommand,
  decideReportCommand,
  discardListCommand,
  proposeFromLinkCommand,
  proposeManualCommand,
  proposeTemplateNowCommand,
  publishListCommand,
  restoreListCommand,
  saveTemplateCommand,
  saveVenueCommand,
  setSponsorCommand,
  suspendListCommand,
  takedownVenuePhotoCommand,
  type AdjustInput,
  type LinkInput,
  type ManualInput,
  type SponsorInput,
  type TemplateInput,
  type VenueInput,
} from "@/lib/studio/guide";

/* Server Actions do admin do Guia (GUIA-T5): camada fina sobre src/lib/studio/guide. */

function reply<O>(r: StudioResult<O>, ok: (v: O) => string): AdminReply {
  if (!r.ok) return { ok: false, message: r.message ?? T.errors.generic };
  return { ok: true, message: ok(r.value) };
}

export async function proposeFromLinkAction(i: LinkInput) {
  return reply(await proposeFromLinkCommand(i), (v) =>
    T.proposals.linkDone(v.verified, v.discarded.length),
  );
}

export async function proposeManualAction(i: ManualInput) {
  return reply(await proposeManualCommand(i), () => T.proposals.manualDone);
}

export async function proposeTemplateNowAction(i: { id: string }) {
  return reply(await proposeTemplateNowCommand(i), () => T.templates.nowDone);
}

export async function adjustListAction(i: AdjustInput) {
  return reply(await adjustListCommand(i), () => T.adjust.saved);
}

export async function publishListAction(i: { id: string }) {
  return reply(await publishListCommand(i), (v) => T.proposals.published(v.slug));
}

export async function discardListAction(i: { id: string; reason: string }) {
  return reply(await discardListCommand(i), () => T.proposals.discarded);
}

export async function suspendListAction(i: { id: string; reason: string }) {
  return reply(await suspendListCommand(i), () => T.lists.suspended);
}

export async function restoreListAction(i: { id: string }) {
  return reply(await restoreListCommand(i), () => T.lists.restored);
}

export async function setSponsorAction(i: SponsorInput) {
  return reply(await setSponsorCommand(i), () => T.lists.sponsorSaved);
}

export async function saveVenueAction(i: VenueInput) {
  return reply(await saveVenueCommand(i), () => T.venues.dialog.saved);
}

export async function saveTemplateAction(i: TemplateInput) {
  return reply(await saveTemplateCommand(i), () => T.templates.dialog.saved);
}

export async function decideReportAction(i: {
  id: string;
  decision: "dismiss" | "confirm";
  note?: string;
}) {
  return reply(await decideReportCommand(i), (v) =>
    i.decision === "dismiss"
      ? T.venues.reports.dismissed(v.restored.length)
      : T.venues.reports.confirmed,
  );
}

export async function takedownVenuePhotoAction(i: { mediaId: string; reason: string }) {
  return reply(await takedownVenuePhotoCommand(i), () => T.venues.takedownDone);
}
