"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { SOURCE_MESSAGES as M } from "@/content/pt-BR/sources-admin";
import { REC } from "@/content/pt-BR/sources-admin-detail";
import { createSourceAdminStore, type AuditCtx } from "@/lib/db/source-admin-store";
import type { Json } from "@/lib/db/types";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import { idOf, textOf, versionOf } from "@/lib/sources/form";
import { requireStudioRole } from "@/lib/studio/guard";

/*
 * Server Action da aba Recomendação (FS-T8, plano P5-T4): nome exibido e as três marcas de
 * recomendação (`rec_pinned`, `rec_local_highlight`, `rec_excluded`). O logotipo usa
 * `uploadLogoAction` de `../actions`. Escrita pela RPC `source_admin_update` (versão otimista e
 * auditoria pelo trigger do banco); nenhum desses campos é crítico.
 */

const NEXT = "/estudio/control/fontes";

type State =
  | { ok: true; message: string; data?: { version: number } }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const fail = (message: string, fieldErrors?: Record<string, string>): State =>
  fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };

const flag = (form: FormData, key: string): boolean | undefined => {
  const v = textOf(form, key);
  return v === undefined ? undefined : v === "true" || v === "on" || v === "1";
};

async function auditCtx(): Promise<AuditCtx> {
  let ipHash: string | null = null;
  try {
    const salt = rateLimitSalt();
    if (salt) ipHash = ipKey(clientIp(await headers()), new Date(), salt);
  } catch {
    ipHash = null;
  }
  return { reason: "Ajuste de recomendação", ipHash };
}

/** Salva o nome exibido e as marcas de recomendação da fonte (`id`, `version`, campos que vieram). */
export async function updateRecommendationAction(form: FormData): Promise<State> {
  const { ctx } = await requireStudioRole("source.manage", { next: NEXT });
  try {
    const id = idOf(form);
    const version = versionOf(form);
    if (!id || version === null) return fail(M.invalid);
    const store = createSourceAdminStore(ctx.db);
    const row = await store.load(id);
    if (!row) return fail(M.notFound);
    if (row.archived_at) return fail(M.archived);
    if (row.version !== version) return fail((await store.conflict(id)).message);

    const patch: { [column: string]: Json } = {};
    const raw = textOf(form, "displayName");
    if (raw !== undefined) {
      const name = raw.trim();
      if (name.length > 60) return fail(M.invalid, { displayName: REC.displayNameError });
      const value = name === "" ? null : name;
      if (value !== row.display_name) patch.display_name = value;
    }
    const pinned = flag(form, "recPinned");
    if (pinned !== undefined && pinned !== row.rec_pinned) patch.rec_pinned = pinned;
    const local = flag(form, "recLocalHighlight");
    if (local !== undefined && local !== row.rec_local_highlight) patch.rec_local_highlight = local;
    const excluded = flag(form, "recExcluded");
    if (excluded !== undefined && excluded !== row.rec_excluded) patch.rec_excluded = excluded;

    if (Object.keys(patch).length === 0)
      return { ok: true, message: REC.noChange, data: { version: row.version } };
    const res = await store.update(id, version, patch, await auditCtx());
    if (!res.ok) return fail(res.message);
    try {
      revalidatePath(`${NEXT}/${id}`, "layout");
      revalidatePath(NEXT);
      revalidateTag("home", { expire: 0 }); // o nome exibido também aparece no "Veja também"
    } catch {
      /* fora de uma requisição (testes) */
    }
    return { ok: true, message: REC.saved, data: { version: res.value.version } };
  } catch (e) {
    console.error("fontes (recomendação):", e instanceof Error ? e.message : e);
    return fail(M.unexpected);
  }
}
