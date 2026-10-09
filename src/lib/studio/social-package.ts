import "server-only";
import { strToU8, zipSync } from "fflate";
import { audit } from "@/lib/audit";
import type { AgendaAuditAction } from "@/lib/audit/actions";
import { can } from "@/lib/auth/permissions";
import {
  findSocialPackage,
  isEventImageServable,
  socialBuildDeps,
  socialPackageStore,
  transitionSocialPackage,
  type TransitionError,
} from "@/lib/db/social-packages";
import { err, ok, type Result } from "@/lib/result";
import {
  buildSocialPackage,
  isSlidePath,
  socialRef,
  type BuildReport,
  type StoredPackage,
} from "@/lib/social/build-package";
import { creditsText } from "@/lib/social/caption";
import type { PackageItem } from "@/lib/social/items";
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
  | "forbidden"
  | "read_only"
  | "invalid_week"
  | "invalid_url"
  | "not_ready"
  /** A foto de algum evento foi retirada, bloqueada, venceu ou a flag de reprodução desligou. */
  | "image_rights"
  /** O pacote foi montado de novo (ou falhou) depois que a pessoa o abriu. */
  | "changed"
  | TransitionError;

const AGENDA_SCOPE = { section: "agenda" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda da semana pedida (`?semana=`), ou a semana corrente de Cuiabá. */
export function weekStartOf(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (raw === null || raw === undefined || raw === "") return weekRange(now).weekStart;
  if (!DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T12:00:00Z`))) return null;
  return weekRange(now, raw).weekStart;
}

const POST_PATH = /^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/;

/**
 * Link do post normalizado para `https://www.instagram.com/{p|reel|tv}/{código}/`, ou `null`.
 * Aceita `instagram.com` sem o `www`; nada de porta, usuário, senha, consulta ou outro caminho.
 */
export function instagramPostUrl(raw: string): string | null {
  if (raw.length > 300) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname === "instagram.com" ? "www.instagram.com" : u.hostname;
    if (u.protocol !== "https:" || host !== "www.instagram.com") return null;
    if (u.port !== "" || u.username !== "" || u.password !== "") return null;
    if (!POST_PATH.test(u.pathname)) return null;
    const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    return `https://www.instagram.com${path}`;
  } catch {
    return null;
  }
}

export function isInstagramPostUrl(raw: string): boolean {
  return instagramPostUrl(raw) !== null;
}

/**
 * Eventos cuja foto não pode mais sair (retirada, bloqueada, vencida, flag de reprodução
 * desligada): a mesma checagem de `/api/media/[id]`, ativo por ativo.
 */
export async function packageImageProblems(
  items: readonly PackageItem[],
  servable: (assetId: string) => Promise<boolean> = isEventImageServable,
): Promise<PackageItem[]> {
  const out: PackageItem[] = [];
  for (const it of items) if (it.image && !(await servable(it.image.assetId))) out.push(it);
  return out;
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

export interface SocialPackageView {
  pkg: StoredPackage | null;
  /** Eventos cuja foto perdeu a autorização depois da montagem. */
  revokedImages: PackageItem[];
}

/** Pacote da semana para a tela (`pkg: null` = ainda não montado) e as fotos que caíram. */
export async function readSocialPackage(
  weekStart: string,
): Promise<Result<SocialPackageView, SocialCommandError>> {
  const g = await guard(null, weekStart, { write: false });
  if (!g.ok) return err(g.error);
  const pkg = await findSocialPackage(g.ctx.db, weekStart);
  return ok({ pkg, revokedImages: pkg ? await packageImageProblems(pkg.items) : [] });
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

/**
 * "Aprovar" (`social.approve`): só a geração que a pessoa viu (`seen` = `generated_at` da tela),
 * sem erro e com todas as fotos ainda autorizadas. Grava quem aprovou e quando; libera o ZIP.
 */
export async function approveSocialPackage(
  weekStart: string,
  seen: string | null,
): Promise<Result<StoredPackage, SocialCommandError>> {
  const g = await guard("social.approve", weekStart, { write: true });
  if (!g.ok) return err(g.error);
  const current = await findSocialPackage(g.ctx.db, weekStart);
  if (!current) return err("not_found");
  if (current.status !== "draft") return err("invalid_state");
  if (current.generatedAt !== seen) return err("changed");
  if (!isReadyToApprove(current)) return err("not_ready");
  if ((await packageImageProblems(current.items)).length > 0) return err("image_rights");
  const at = g.ctx.now().toISOString();
  const r = await transitionSocialPackage(
    g.ctx.db,
    weekStart,
    ["draft"],
    { status: "approved", approved_by: g.userId, approved_at: at },
    seen,
  );
  // O filtro da geração não bateu: alguém montou de novo entre a leitura e a gravação.
  if (!r.ok) return err(r.error === "invalid_state" ? "changed" : r.error);
  await audit(
    g.userId,
    "social.approve",
    socialRef(weekStart),
    {
      week_start: weekStart,
      events: r.value.items.length,
      generation: seen,
      approved_at: r.value.approvedAt ?? at,
    },
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
  const link = instagramPostUrl(url);
  if (!link) return err("invalid_url");
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
  if (!p || !path || !isSlidePath(weekStart, path)) return err("not_found");
  const file = await socialPackageStore().read(path);
  return file.ok ? ok(file.value.bytes) : err("not_found");
}

export interface SocialZip {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * ZIP do pacote aprovado (ou já publicado): os PNGs (`01.png`…), `caption.txt` e
 * `creditos.txt`. Antes da aprovação, `not_ready`; com foto que perdeu a autorização,
 * `image_rights` (as fotos são conferidas de novo a cada download).
 */
export async function socialZip(weekStart: string): Promise<Result<SocialZip, SocialCommandError>> {
  const g = await guard(null, weekStart, { write: false });
  if (!g.ok) return err(g.error);
  const p = await findSocialPackage(g.ctx.db, weekStart);
  if (!p) return err("not_found");
  if (p.status !== "approved" && p.status !== "published") return err("not_ready");
  if ((await packageImageProblems(p.items)).length > 0) return err("image_rights");
  if (!p.assets.every((path) => isSlidePath(weekStart, path))) return err("not_found");
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
