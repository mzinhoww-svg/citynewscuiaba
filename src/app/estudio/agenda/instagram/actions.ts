"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveSocialPackage,
  discardSocialPackage,
  markSocialPublished,
  regenerateSocialPackage,
  weekStartOf,
  type SocialCommandError,
} from "@/lib/studio/social-package";

/**
 * Ações do pacote "Agenda da semana" (ARD-T6). A checagem de papel, o modo leitura e a
 * auditoria ficam nos comandos (`src/lib/studio/social-package.ts`); aqui só o formulário e a
 * volta para a tela com o aviso.
 */
const BASE = "/estudio/agenda/instagram";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function weekOf(form: FormData): string {
  const w = weekStartOf(String(form.get("semana") ?? ""));
  if (!w) redirect(`${BASE}?erro=invalid_week`);
  return w;
}

function back(
  week: string,
  r: { ok: true } | { ok: false; error: SocialCommandError },
  done: string,
): never {
  revalidatePath(BASE);
  const q = r.ok ? `feito=${done}` : `erro=${r.error}`;
  redirect(`${BASE}?semana=${week}&${q}`);
}

/** "Regerar" / "Montar agora": `tirar` = eventos que saem; `devolver=1` devolve os tirados. */
export async function regenerateSocialAction(form: FormData): Promise<void> {
  const week = weekOf(form);
  const exclude = form
    .getAll("tirar")
    .map(String)
    .filter((id) => UUID.test(id));
  const r = await regenerateSocialPackage(week, { exclude, restore: form.get("devolver") === "1" });
  back(week, r, "montado");
}

/** "Aprovar" leva a geração que a pessoa viu (`geracao`): pacote refeito no meio não é aprovado. */
export async function approveSocialAction(form: FormData): Promise<void> {
  const week = weekOf(form);
  const seen = String(form.get("geracao") ?? "").slice(0, 64);
  back(week, await approveSocialPackage(week, seen === "" ? null : seen), "aprovado");
}

export async function discardSocialAction(form: FormData): Promise<void> {
  const week = weekOf(form);
  back(week, await discardSocialPackage(week), "descartado");
}

export async function publishSocialAction(form: FormData): Promise<void> {
  const week = weekOf(form);
  back(
    week,
    await markSocialPublished(week, String(form.get("url") ?? "").slice(0, 400)),
    "publicado",
  );
}
