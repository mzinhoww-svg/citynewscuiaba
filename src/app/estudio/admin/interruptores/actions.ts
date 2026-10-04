"use server";

import { ACTION_NAME, type ContingencyAction } from "@/content/pt-BR/contingency";
import {
  REVIEWER_TEXT,
  SWITCH_INFO,
  SWITCH_TEXT as T,
  type SWITCH_KEYS,
} from "@/content/pt-BR/switches";
import { contingencyCommand } from "@/lib/studio/contingency";
import { isFreeSwitch, setReviewerModeCommand, setSwitchCommand } from "@/lib/studio/switches";

/* Server Action dos Interruptores: livres pela flag; guardados pela Contingência. */

const GUARDED: Record<
  "auto_publish" | "read_only" | "ai_enabled",
  { on: ContingencyAction; off: ContingencyAction }
> = {
  auto_publish: { on: "resume_auto_publish", off: "pause_auto_publish" },
  read_only: { on: "read_only_on", off: "read_only_off" },
  ai_enabled: { on: "ai_on", off: "ai_off" },
};

export async function switchAction(i: {
  key: (typeof SWITCH_KEYS)[number];
  value: boolean;
  reason: string;
}): Promise<{ ok: boolean; message: string }> {
  const label = SWITCH_INFO[i.key].title;
  if (isFreeSwitch(i.key)) {
    const r = await setSwitchCommand({ key: i.key, value: i.value, reason: i.reason });
    if (!r.ok) return { ok: false, message: r.message ?? T.error.generic };
    return {
      ok: true,
      message: r.value.changed ? T.result.changed(label, i.value) : T.result.unchanged,
    };
  }
  const action = GUARDED[i.key as keyof typeof GUARDED][i.value ? "on" : "off"];
  const r = await contingencyCommand({ action, typed: ACTION_NAME[action], reason: i.reason });
  if (!r.ok) return { ok: false, message: r.message ?? T.error.generic };
  const changed = "changed" in r.value ? r.value.changed : true;
  return { ok: true, message: changed ? T.result.changed(label, i.value) : T.result.unchanged };
}

/** Modo do revisor automático (AUT-T6). */
export async function reviewerModeAction(i: {
  mode: "off" | "night" | "always";
  reason: string;
}): Promise<{ ok: boolean; message: string }> {
  const r = await setReviewerModeCommand(i);
  if (!r.ok) return { ok: false, message: r.message ?? T.error.generic };
  return { ok: true, message: REVIEWER_TEXT.result(REVIEWER_TEXT.modes[i.mode].label) };
}
