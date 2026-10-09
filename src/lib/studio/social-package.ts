import "server-only";
import { strToU8, zipSync } from "fflate";
import { audit } from "@/lib/audit";
import type { AgendaAuditAction } from "@/lib/audit/actions";
import { can } from "@/lib/auth/permissions";
import {
  findSocialPackage,
  socialBuildDeps,
  socialPackageStore,
  transitionSocialPackage,
  type TransitionError,
} from "@/lib/db/social-packages";
import { err, ok, type Result } from "@/lib/result";
import {
  buildSocialPackage,
  socialRef,
  type BuildReport,
  type StoredPackage,
} from "@/lib/social/build-package";
import { creditsText } from "@/lib/social/caption";
import { weekRange } from "@/lib/social/pick-week";
import { studioContext, type StudioContext } from "./context";
import { isReadOnly } from "./read-only";

/**
 * Comandos do pacote "Agenda da semana" no Estúdio (ARD-T6, spec §7): mesma guarda das telas da
 * Agenda (papel `article.publish` na editoria Agenda; negação auditada com `.denied`; modo
 * leitura para o que grava). As mudanças de estado vão com a sessão da pessoa (RLS da editoria);
 * os PNGs saem do bucket privado só depois da checagem.
 */

export type SocialCommandError =
  "forbidden" | "read_only" | "invalid_week" | "invalid_url" | "not_ready" | TransitionError;

const AGENDA_SCOPE = { section: "agenda" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda da semana pedida (`?semana=`), ou a semana corrente de Cuiabá. */
export function weekStartOf(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (raw === null || raw === undefined || raw === "") return weekRange(now).weekStart;
  if (!DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T12:00:00Z`))) return null;
  return weekRange(now, raw).weekStart;
}

/** Link do post: só `https://www.instagram.com/…` (sem porta, usuário ou senha). */
export function isInstagramPostUrl(raw: string): boolean {
  if (raw.length > 300) return false;
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.hostname === "www.instagram.com" &&
      u.port === "" &&
      u.username === "" &&
      u.password === "" &&
      u.pathname.length > 1
    );
  } catch {
    return false;
  }
}

type Guarded =
  { ok: true; ctx: StudioContext; userId: string } | { ok: false; error: SocialCommandError };

async function guard(
  action: AgendaAuditAction | null,
  weekStart: string,
  opts: { write: boolean },
): Promise<Guarded> {
  const ctx = await studioContext();
  const s = ctx.session;
  if (!s) return { ok: false, error: "forbidden" };
  if (!can(s.roles, "article.publish", { ...AGENDA_SCOPE, userId: s.userId })) {
    if (action)
      await audit(
        s.userId,
        `${action}.denied`,
        socialRef(weekStart),
        { scope: AGENDA_SCOPE },
        ctx.db,
      );
    return { ok: false, error: "forbidden" };
  }
  if (opts.write && (await isReadOnly(ctx.db))) return { ok: false, error: "read_only" };
  return { ok: true, ctx, userId: s.userId };
}

/** Pacote da semana para a tela (`null` = ainda não montado). */
export async function readSocialPackage(
  weekStart: string,
): Promise<Result<StoredPackage | null, SocialCommandError>> {
  const g = await guard(null, weekStart, { write: false });
  if (!g.ok) return err(g.error);
  return ok(await findSocialPackage(g.ctx.db, weekStart));
}

/**
 * "Regerar": refaz o rascunho (ou o descartado) com os eventos da semana, sem os tirados.
 * `exclude` soma aos que já estavam fora; `restore` devolve todos ao pacote.
 */
export async function regenerateSocialPackage(
  weekStart: string,
  opts: { exclude?: readonly string[]; restore?: boolean } = {},
): Promise<Result<BuildReport, SocialCommandError>> {
  const g = await guard("social.regenerate", weekStart, { write: true });
  if (!g.ok) return err(g.error);
  const current = await findSocialPackage(g.ctx.db, weekStart);
  if (current && (current.status === "approved" || current.status === "published"))
    return err("invalid_state");
  const exclude = opts.restore ? [] : [...(current?.excluded ?? []), ...(opts.exclude ?? [])];
  const { ctx, userId } = g;
  const report = await buildSocialPackage(
    socialBuildDeps({
      now: ctx.now(),
      weekStart,
      audit: (ref, details) => audit(userId, "social.regenerate", ref, details, ctx.db),
    }),
    { exclude, allowFrom: ["draft", "discarded"] },
  );
  if (report.outcome === "skipped") return err("invalid_state");
  return ok(report);
}

/** Pronto para aprovar: rascunho sem erro, com eventos e todos os PNGs (capa + eventos + final). */
export function isReadyToApprove(p: StoredPackage): boolean {
  return (
    p.status === "draft" &&
    p.error === null &&
    p.items.length > 0 &&
    p.assets.length === p.items.length + 2
  );
}

/** "Aprovar" (`social.approve`): grava quem aprovou e quando; libera o ZIP. */
export async function approveSocialPackage(
  weekStart: string,
): Promise<Result<StoredPackage, SocialCommandError>> {
  const g = await guard("social.approve", weekStart, { write: true });
  if (!g.ok) return err(g.error);
  const current = await findSocialPackage(g.ctx.db, weekStart);
  if (!current) return err("not_found");
  if (!isReadyToApprove(current))
    return err(current.status === "draft" ? "not_ready" : "invalid_state");
  const at = g.ctx.now().toISOString();
  const r = await transitionSocialPackage(g.ctx.db, weekStart, ["draft"], {
    status: "approved",
    approved_by: g.userId,
    approved_at: at,
  });
  if (!r.ok) return r;
  await audit(
    g.userId,
    "social.approve",
    socialRef(weekStart),
    { week_start: weekStart, events: r.value.items.length, approved_at: at },
    g.ctx.db,
  );
  return r;
}

/** "Descartar" (`social.discard`): rascunho ou aprovado; publicado não volta. */
export async function discardSocialPackage(
  weekStart: string,
): Promise<Result<StoredPackage, SocialCommandError>> {
  const g = await guard("social.discard", weekStart, { write: true });
  if (!g.ok) return err(g.error);
  const before = await findSocialPackage(g.ctx.db, weekStart);
  const r = await transitionSocialPackage(g.ctx.db, weekStart, ["draft", "approved"], {
    status: "discarded",
    approved_by: null,
    approved_at: null,
  });
  if (!r.ok) return r;
  await audit(
    g.userId,
    "social.discard",
    socialRef(weekStart),
    { week_start: weekStart, from: before?.status ?? null },
    g.ctx.db,
  );
  return r;
}

/** "Marcar como publicado" (`social.publish`) com o link do post no Instagram. */
export async function markSocialPublished(
  weekStart: string,
  url: string,
): Promise<Result<StoredPackage, SocialCommandError>> {
  const g = await guard("social.publish", weekStart, { write: true });
  if (!g.ok) return err(g.error);
  const link = url.trim();
  if (!isInstagramPostUrl(link)) return err("invalid_url");
  const r = await transitionSocialPackage(g.ctx.db, weekStart, ["approved"], {
    status: "published",
    published_url: link,
  });
  if (!r.ok) return r;
  await audit(
    g.userId,
    "social.publish",
    socialRef(weekStart),
    { week_start: weekStart, url: link },
    g.ctx.db,
  );
  return r;
}

/** PNG de um slide (prévia do Estúdio), lido do bucket privado depois da checagem de papel. */
export async function socialSlide(
  weekStart: string,
  index: number,
): Promise<Result<Uint8Array, SocialCommandError>> {
  const g = await guard(null, weekStart, { write: false });
  if (!g.ok) return err(g.error);
  const p = await findSocialPackage(g.ctx.db, weekStart);
  const path = p?.assets[index];
  if (!p || !path) return err("not_found");
  const file = await socialPackageStore().read(path);
  return file.ok ? ok(file.value.bytes) : err("not_found");
}

export interface SocialZip {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * ZIP do pacote aprovado (ou já publicado): os PNGs (`01.png`…), `caption.txt` e
 * `creditos.txt`. Antes da aprovação, `not_ready`.
 */
export async function socialZip(weekStart: string): Promise<Result<SocialZip, SocialCommandError>> {
  const g = await guard(null, weekStart, { write: false });
  if (!g.ok) return err(g.error);
  const p = await findSocialPackage(g.ctx.db, weekStart);
  if (!p) return err("not_found");
  if (p.status !== "approved" && p.status !== "published") return err("not_ready");
  const store = socialPackageStore();
  const files: Record<string, Uint8Array> = {};
  for (const path of p.assets) {
    const f = await store.read(path);
    if (!f.ok) return err("not_found");
    files[path.split("/").pop() ?? path] = f.value.bytes;
  }
  files["caption.txt"] = strToU8(p.caption);
  files["creditos.txt"] = strToU8(creditsText(p.items));
  return ok({ fileName: `agenda-da-semana-${weekStart}.zip`, bytes: zipSync(files, { level: 0 }) });
}
