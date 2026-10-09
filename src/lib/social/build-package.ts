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
   * `allowFrom` e a geração gravada ainda for `seen` (`generated_at` lido no começo da rodada;
   * `null` = ainda não havia pacote montado). Devolve `null` quando não tocou em nada.
   */
  save(
    write: PackageWrite,
    allowFrom: readonly PackageStatus[],
    seen: string | null,
  ): Promise<StoredPackage | null>;
  upload(path: string, bytes: Uint8Array): Promise<Result<void, string>>;
  remove(paths: readonly string[]): Promise<void>;
  audit(objectRef: string, details: Record<string, unknown>): Promise<void>;
  /**
   * Geração desta rodada: id curto (pasta dos PNGs) e o carimbo gravado em `generated_at`.
   * Padrão: aleatório e o relógio real (nunca `now`, que pode ser fixado por `?now=`).
   */
  generation?(): { id: string; at: string };
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
  /**
   * Ids dos eventos cujo título não coube no slide nem no corpo mínimo (linhas cortadas; a
   * legenda tem o texto inteiro). Também ficam marcados no item (`titleClamped`).
   */
  clamped: string[];
  error?: string;
}

/**
 * Caminho do PNG no bucket privado: `{segunda}/{geração}/NN.png`. Cada montagem grava numa pasta
 * própria: uma rodada nunca regrava os arquivos de outra (nem os de um pacote já aprovado).
 */
export function slidePath(weekStart: string, generation: string, index: number): string {
  return `${weekStart}/${generation}/${String(index + 1).padStart(2, "0")}.png`;
}

/** Caminho válido de PNG do pacote daquela semana (antes de ler o Storage). */
export function isSlidePath(weekStart: string, path: string): boolean {
  return new RegExp(`^${weekStart}/[a-z0-9]+/\\d{2}\\.png$`).test(path);
}

function defaultGeneration(): { id: string; at: string } {
  const id = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return { id, at: new Date().toISOString() };
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
  const picked = pickWeekEvents(await deps.loadEvents(range), range, {
    exclude: excluded,
    now: deps.now,
  });
  const gen = (deps.generation ?? defaultGeneration)();
  const seen = existing?.generatedAt ?? null;
  const previous = existing?.assets ?? [];

  const finish = async (
    write: Omit<PackageWrite, "weekStart" | "excluded" | "generatedAt">,
    outcome: BuildOutcome,
    extra: Partial<BuildReport> = {},
  ): Promise<BuildReport> => {
    const saved = await deps.save(
      { ...write, weekStart, excluded, generatedAt: gen.at },
      allowFrom,
      seen,
    );
    if (!saved) {
      // Alguém aprovou, descartou ou montou de novo no meio da rodada: os PNGs desta geração
      // não valem. Os da outra geração (inclusive de um pacote aprovado) ficam intactos.
      await deps.remove(write.assets);
      const now = await deps.find(weekStart);
      return { ...base, ...extra, outcome: "skipped", status: now?.status ?? null };
    }
    const keep = new Set(write.assets);
    await deps.remove(previous.filter((p) => !keep.has(p)));
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
      generation: gen.id,
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
  const clamped = new Set(rendered.ok ? rendered.value.clamped : []);
  const final = items.map((it) => ({
    ...it,
    image: it.image && shown.has(it.eventId) ? it.image : null,
    ...(clamped.has(it.eventId) ? { titleClamped: true } : {}),
  }));
  const caption = buildCaption(final, label);
  const counts = { events: final.length, withImage: final.filter((i) => i.image).length };
  if (!rendered.ok)
    return finish(
      { items: final, caption, assets: [], error: `render: ${rendered.error}` },
      "failed",
      counts,
    );

  const assets: string[] = [];
  for (const [i, png] of rendered.value.pngs.entries()) {
    const path = slidePath(weekStart, gen.id, i);
    const up = await deps.upload(path, png);
    if (!up.ok) {
      await deps.remove(assets);
      return finish(
        { items: final, caption, assets: [], error: `upload: ${up.error}` },
        "failed",
        counts,
      );
    }
    assets.push(path);
  }
  return finish({ items: final, caption, assets, error: null }, "built", {
    ...counts,
    slides: assets.length,
    clamped: [...clamped],
  });
}
