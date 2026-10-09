import type { Result } from "@/lib/result";
import { buildCaption } from "./caption";
import { packageItems, weekLabel, type PackageItem } from "./items";
import { pickWeekEvents, weekRange, type WeekEvent, type WeekRange } from "./pick-week";
import type { SlidesInput, SlidesOutput } from "./slides";

/**
 * Montagem do pacote "Agenda da semana" (ARD-T6, spec §7 e §8), com as dependências injetadas
 * (job e "Regerar" do Estúdio usam a mesma). Uma linha por `(instagram_agenda, segunda)`:
 * rodar de novo atualiza o rascunho; pacote aprovado, publicado ou descartado nunca é tocado
 * pelo job. Falha de render ou de upload deixa o pacote `draft` com o erro visível; nada é
 * publicado sozinho (a postagem é à mão, depois de aprovada).
 */

export const SOCIAL_KIND = "instagram_agenda";
export const PACKAGE_STATUSES = ["draft", "approved", "published", "discarded"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export interface StoredPackage {
  id: string;
  weekStart: string;
  status: PackageStatus;
  items: PackageItem[];
  caption: string;
  /** Caminhos dos PNGs no bucket privado, na ordem do carrossel. */
  assets: string[];
  error: string | null;
  /** Eventos tirados do pacote pela redação. */
  excluded: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  publishedUrl: string | null;
  generatedAt: string | null;
}

export interface PackageWrite {
  weekStart: string;
  items: PackageItem[];
  caption: string;
  assets: string[];
  error: string | null;
  excluded: string[];
  generatedAt: string;
}

export interface BuildDeps {
  now: Date;
  /** Segunda da semana ("AAAA-MM-DD"); sem ela, a semana de `now`. */
  weekStart?: string;
  loadEvents(range: WeekRange): Promise<WeekEvent[]>;
  /** Bytes da foto pelo id do ativo, com as regras do Media Registry; `null` = sem foto. */
  loadImage(assetId: string): Promise<Uint8Array | null>;
  render(input: SlidesInput): Promise<Result<SlidesOutput, string>>;
  find(weekStart: string): Promise<StoredPackage | null>;
  /**
   * Insere ou atualiza o pacote voltando-o a `draft`, só se o estado atual estiver em
   * `allowFrom`; devolve `null` quando não tocou em nada.
   */
  save(write: PackageWrite, allowFrom: readonly PackageStatus[]): Promise<StoredPackage | null>;
  upload(path: string, bytes: Uint8Array): Promise<Result<void, string>>;
  remove(paths: readonly string[]): Promise<void>;
  audit(objectRef: string, details: Record<string, unknown>): Promise<void>;
}

export interface BuildOptions {
  /** Eventos tirados do pacote; sem isso, os que já estavam tirados continuam fora. */
  exclude?: readonly string[];
  /** Estados que podem ser refeitos. Job: só `draft`; "Regerar": `draft` e `discarded`. */
  allowFrom?: readonly PackageStatus[];
}

export type BuildOutcome = "built" | "empty" | "failed" | "skipped";

export interface BuildReport {
  weekStart: string;
  outcome: BuildOutcome;
  /** Estado do pacote depois da rodada (o que já estava, quando `skipped`). */
  status: PackageStatus | null;
  events: number;
  slides: number;
  withImage: number;
  /** Títulos que não couberam no slide (linhas cortadas; a legenda tem o texto inteiro). */
  clamped: string[];
  error?: string;
}

/** Caminho do PNG no bucket privado: `{segunda}/NN.png`. */
export function slidePath(weekStart: string, index: number): string {
  return `${weekStart}/${String(index + 1).padStart(2, "0")}.png`;
}

export const socialRef = (weekStart: string) => `social:${SOCIAL_KIND}:${weekStart}`;

export async function buildSocialPackage(
  deps: BuildDeps,
  opts: BuildOptions = {},
): Promise<BuildReport> {
  const range = weekRange(deps.now, deps.weekStart);
  const weekStart = range.weekStart;
  const allowFrom = opts.allowFrom ?? ["draft"];
  const existing = await deps.find(weekStart);
  const base = { weekStart, events: 0, slides: 0, withImage: 0, clamped: [] as string[] };
  if (existing && !allowFrom.includes(existing.status))
    return { ...base, outcome: "skipped", status: existing.status };

  const excluded = [...new Set(opts.exclude ?? existing?.excluded ?? [])];
  const picked = pickWeekEvents(await deps.loadEvents(range), range, { exclude: excluded });
  const generatedAt = deps.now.toISOString();
  const stale = existing?.assets ?? [];

  const finish = async (
    write: Omit<PackageWrite, "weekStart" | "excluded" | "generatedAt">,
    outcome: BuildOutcome,
    extra: Partial<BuildReport> = {},
  ): Promise<BuildReport> => {
    const saved = await deps.save({ ...write, weekStart, excluded, generatedAt }, allowFrom);
    if (!saved) {
      // Alguém aprovou ou descartou no meio da rodada: os PNGs novos não valem.
      const fresh = new Set(stale);
      await deps.remove(write.assets.filter((p) => !fresh.has(p)));
      const now = await deps.find(weekStart);
      return { ...base, ...extra, outcome: "skipped", status: now?.status ?? null };
    }
    const keep = new Set(write.assets);
    await deps.remove(stale.filter((p) => !keep.has(p)));
    const report: BuildReport = {
      ...base,
      ...extra,
      outcome,
      status: saved.status,
      ...(write.error ? { error: write.error } : {}),
    };
    await deps.audit(socialRef(weekStart), {
      week_start: weekStart,
      outcome,
      events: report.events,
      slides: report.slides,
      with_image: report.withImage,
      excluded,
      ...(report.clamped.length ? { clamped: report.clamped } : {}),
      ...(write.error ? { error: write.error } : {}),
    });
    return report;
  };

  if (picked.length === 0)
    return finish({ items: [], caption: "", assets: [], error: null }, "empty");

  const items = packageItems(picked, range);
  const images = new Map<string, Uint8Array>();
  for (const it of items) {
    if (!it.image) continue;
    const bytes = await deps.loadImage(it.image.assetId).catch(() => null);
    if (bytes) images.set(it.eventId, bytes);
  }
  const label = weekLabel(range);
  const rendered = await deps.render({ rangeLabel: label, items, images });
  // A foto que não entrou no slide (ilegível, retirada) sai também dos créditos da legenda.
  const shown = rendered.ok ? new Set(rendered.value.withImage) : new Set(images.keys());
  const final = items.map((it) =>
    it.image && !shown.has(it.eventId) ? { ...it, image: null } : it,
  );
  const caption = buildCaption(final, label);
  const counts = { events: final.length, withImage: final.filter((i) => i.image).length };
  if (!rendered.ok)
    return finish(
      { items: final, caption, assets: [], error: `render: ${rendered.error}` },
      "failed",
      counts,
    );

  // Os PNGs regravam os mesmos caminhos: confere de novo o estado logo antes de subir, para
  // não trocar os arquivos de um pacote aprovado no meio desta rodada.
  const current = await deps.find(weekStart);
  if (current && !allowFrom.includes(current.status))
    return { ...base, outcome: "skipped", status: current.status };
  const assets: string[] = [];
  for (const [i, png] of rendered.value.pngs.entries()) {
    const path = slidePath(weekStart, i);
    const up = await deps.upload(path, png);
    if (!up.ok)
      return finish(
        { items: final, caption, assets: [], error: `upload: ${up.error}` },
        "failed",
        counts,
      );
    assets.push(path);
  }
  return finish({ items: final, caption, assets, error: null }, "built", {
    ...counts,
    slides: assets.length,
    clamped: rendered.value.clamped,
  });
}
