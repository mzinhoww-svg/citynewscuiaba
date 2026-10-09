import "server-only";
import { z } from "zod";
import type { AgendaAuditAction } from "@/lib/audit/actions";
import { isServable } from "@/lib/media/serve";
import { createMemoryMediaStore, type MediaStore } from "@/lib/media/store";
import { err, ok, type Result } from "@/lib/result";
import {
  PACKAGE_STATUSES,
  SOCIAL_KIND,
  type BuildDeps,
  type PackageStatus,
  type PackageWrite,
  type StoredPackage,
} from "@/lib/social/build-package";
import type { PackageItem } from "@/lib/social/items";
import type { WeekEvent } from "@/lib/social/pick-week";
import { renderSlides } from "@/lib/social/slides";
import type { DbClient } from "./client";
import { createServiceClient } from "./client";
import { mediaServeDeps } from "./media-serve";
import { createSupabaseMediaStore } from "./media-store";
import { agendaSystemAudit } from "./newsletter-editions";
import { listEventsInRange } from "./queries/events";
import type { Json } from "./types";

/**
 * Pacote "Agenda da semana" do Instagram (`social_packages`, ARD-T1/ARD-T6). A RLS deixa a
 * editoria Agenda ler e escrever (Estúdio, com a sessão da pessoa); o job escreve com a service
 * role. Os PNGs ficam no bucket privado `social-packages` e só saem pelas rotas do Estúdio, depois
 * da checagem de papel.
 */

export const SOCIAL_BUCKET = "social-packages";
/** Teto de eventos lidos para escolher os 6 da semana. */
const EVENTS_MAX = 400;

const COLUMNS =
  "id, week_start, status, items, caption, assets, error, excluded, approved_by, approved_at, published_url, generated_at";

const imageSchema = z.object({
  assetId: z.string(),
  credit: z.string(),
  originUrl: z.string().nullable(),
});
const itemSchema = z.object({
  eventId: z.string(),
  slug: z.string(),
  title: z.string(),
  day: z.string(),
  dayLabel: z.string(),
  time: z.string(),
  venue: z.string(),
  price: z.string().nullable(),
  origin: z.string().nullable(),
  image: imageSchema.nullable(),
});

/** Itens gravados em `items` (jsonb); item fora do formato fica de fora. */
export function parsePackageItems(raw: unknown): PackageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = itemSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
const statusOf = (s: string): PackageStatus => PACKAGE_STATUSES.find((x) => x === s) ?? "draft";

interface Row {
  id: string;
  week_start: string;
  status: string;
  items: Json;
  caption: string;
  assets: Json;
  error: string | null;
  excluded: Json;
  approved_by: string | null;
  approved_at: string | null;
  published_url: string | null;
  generated_at: string | null;
}

const stored = (r: Row): StoredPackage => ({
  id: r.id,
  weekStart: r.week_start,
  status: statusOf(r.status),
  items: parsePackageItems(r.items),
  caption: r.caption,
  assets: strings(r.assets),
  error: r.error,
  excluded: strings(r.excluded),
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  publishedUrl: r.published_url,
  generatedAt: r.generated_at,
});

/** Pacote da semana; `null` quando ainda não foi montado (ou a RLS não deixa ver). */
export async function findSocialPackage(
  db: DbClient,
  weekStart: string,
): Promise<StoredPackage | null> {
  const r = await db
    .from("social_packages")
    .select(COLUMNS)
    .eq("kind", SOCIAL_KIND)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (r.error) throw new Error(`social_packages: ${r.error.message}`);
  return r.data ? stored(r.data) : null;
}

/**
 * Grava o rascunho da semana. Atualiza só se o estado atual estiver em `allowFrom` (o filtro
 * vai no próprio `update`, então uma aprovação no meio nunca é sobrescrita); corrida de
 * inserção (`23505`) vira atualização. Devolve `null` quando não tocou em nada.
 */
export async function saveSocialDraft(
  db: DbClient,
  w: PackageWrite,
  allowFrom: readonly PackageStatus[],
): Promise<StoredPackage | null> {
  const values = {
    status: "draft",
    items: w.items as unknown as NonNullable<Json>,
    caption: w.caption,
    assets: w.assets as unknown as NonNullable<Json>,
    error: w.error,
    excluded: w.excluded as unknown as NonNullable<Json>,
    generated_at: w.generatedAt,
    approved_by: null,
    approved_at: null,
    published_url: null,
  };
  const update = async () => {
    const r = await db
      .from("social_packages")
      .update(values)
      .eq("kind", SOCIAL_KIND)
      .eq("week_start", w.weekStart)
      .in("status", [...allowFrom])
      .select(COLUMNS)
      .maybeSingle();
    if (r.error) throw new Error(`social_packages: ${r.error.message}`);
    return r.data ? stored(r.data) : null;
  };
  if (await findSocialPackage(db, w.weekStart)) return update();
  const ins = await db
    .from("social_packages")
    .insert({ kind: SOCIAL_KIND, week_start: w.weekStart, ...values })
    .select(COLUMNS)
    .single();
  if (ins.error?.code === "23505") return update();
  if (ins.error) throw new Error(`social_packages: ${ins.error.message}`);
  return stored(ins.data);
}

export type TransitionError = "not_found" | "invalid_state" | "forbidden";

/**
 * Muda o estado do pacote com a sessão da pessoa (RLS da editoria Agenda). O filtro `from` vai
 * no `update`: duas pessoas clicando ao mesmo tempo, só a primeira muda.
 */
export async function transitionSocialPackage(
  db: DbClient,
  weekStart: string,
  from: readonly PackageStatus[],
  patch: {
    status: PackageStatus;
    approved_by?: string | null;
    approved_at?: string | null;
    published_url?: string | null;
  },
): Promise<Result<StoredPackage, TransitionError>> {
  const r = await db
    .from("social_packages")
    .update(patch)
    .eq("kind", SOCIAL_KIND)
    .eq("week_start", weekStart)
    .in("status", [...from])
    .select(COLUMNS)
    .maybeSingle();
  if (r.error) return err(r.error.code === "42501" ? "forbidden" : "invalid_state");
  if (r.data) return ok(stored(r.data));
  const now = await findSocialPackage(db, weekStart);
  return err(now ? "invalid_state" : "not_found");
}

const stores = globalThis as typeof globalThis & { __citynewsSocialStore?: MediaStore };

/**
 * Storage dos PNGs: bucket privado `social-packages` (service role). A pilha local sem Storage
 * (A-017) usa `SOCIAL_STORE=memory`, só fora de produção: um armazenamento em memória único por
 * processo (o job e as telas do Estúdio rodam no mesmo servidor e enxergam os mesmos arquivos).
 */
export function socialPackageStore(): MediaStore {
  if (process.env.SOCIAL_STORE === "memory" && process.env.NODE_ENV !== "production") {
    stores.__citynewsSocialStore ??= createMemoryMediaStore();
    return stores.__citynewsSocialStore;
  }
  return createSupabaseMediaStore(createServiceClient(), SOCIAL_BUCKET);
}

/**
 * Bytes da foto do evento pelas mesmas regras de `/api/media/[id]`: leitura do ativo com o
 * cliente público (a RLS exige `approved`, não retirado, licença válida e a flag de reprodução)
 * e `isServable` de novo; os bytes vêm do bucket privado `media`. Qualquer falha = sem foto.
 */
export async function loadEventImage(assetId: string): Promise<Uint8Array | null> {
  try {
    const deps = mediaServeDeps();
    const asset = await deps.asset(assetId);
    if (!asset || !(await isServable(asset, deps))) return null;
    const file = await deps.store.read(asset.storagePath);
    return file.ok ? file.value.bytes : null;
  } catch {
    return null;
  }
}

/** Eventos públicos da semana (RLS: confirmado e não retirado), como a Agenda e a newsletter. */
async function weekEvents(range: { start: Date; end: Date }): Promise<WeekEvent[]> {
  const r = await listEventsInRange(
    { from: range.start.toISOString(), to: new Date(range.end.getTime() + 1000).toISOString() },
    EVENTS_MAX,
  );
  if (!r.ok) throw new Error(`eventos: ${r.error.kind}`);
  return r.value;
}

/**
 * Dependências de produção da montagem. Escrita com a service role (o job não tem sessão; o
 * "Regerar" do Estúdio já passou pela checagem de papel). `audit` decide quem assina.
 */
export function socialBuildDeps(opts: {
  now: Date;
  weekStart?: string;
  audit: BuildDeps["audit"];
}): BuildDeps {
  const db = createServiceClient();
  const store = socialPackageStore();
  return {
    now: opts.now,
    ...(opts.weekStart ? { weekStart: opts.weekStart } : {}),
    loadEvents: weekEvents,
    loadImage: loadEventImage,
    render: renderSlides,
    find: (weekStart) => findSocialPackage(db, weekStart),
    save: (w, allowFrom) => saveSocialDraft(db, w, allowFrom),
    async upload(path, bytes) {
      const r = await store.put(path, bytes, "image/png");
      return r.ok ? ok(undefined) : err(r.error);
    },
    async remove(paths) {
      for (const p of paths) await store.remove(p);
    },
    audit: opts.audit,
  };
}

/** Auditoria da montagem automática (`system:agenda`, `social.build`). */
export function socialSystemAudit(db: DbClient = createServiceClient()): BuildDeps["audit"] {
  const action: AgendaAuditAction = "social.build";
  return (ref, details) => agendaSystemAudit(db, action, ref, details);
}
