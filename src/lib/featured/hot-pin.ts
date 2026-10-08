/*
 * Pauta quente vira destaque (HOT-T3; spec 2026-10-03-destaques-e-profundidade R8, R10, R11, R21).
 *
 * Quando portais distintos mantêm um assunto no topo da página inicial (`detectHot` sobre
 * `front_signals` das últimas 6 h, limiar `hot_min_sources`), a melhor matéria **já publicada**
 * do assunto ganha um pino `kind = 'hot'` por 3 h em `home.lead`, no `editoria.lead` da editoria
 * dela e, quando não coube na manchete, numa vaga de `home.destaques`. O pino é renovado enquanto
 * o sinal dura, com teto de 12 h desde o primeiro pino do assunto.
 *
 * Regras que nunca quebram:
 *  - nunca publica, nunca muda status de matéria: só grava pinos;
 *  - manual vence: posição com pino manual vigente não recebe (nem renova) pino quente;
 *  - patrocinada, matéria fora do ar, sem capa aprovada ou fora do escopo (R21: só `cuiaba` e `mt`;
 *    `national` só com comoção nacional) nunca entram;
 *  - assunto dispensado pelo admin (`dismissed_at`) só volta com um sinal novo inteiro, isto é,
 *    `hot_min_sources` portais vistos depois da dispensa;
 *  - idempotente: rodar de novo no mesmo instante não grava nada.
 */
import type { NewsScope } from "@/lib/geo/news-scope";
import { DEFAULT_SLOTS } from "./types";
import { detectHot, HOT_DEFAULTS, type FrontSignal } from "./hot";

/** Duração de cada pino (e de cada renovação). */
export const HOT_PIN_HOURS = 3;
/** Teto desde o primeiro pino do assunto. */
export const HOT_PIN_MAX_HOURS = 12;
/** Janela de sinais lida (a mesma do `detectHot`). */
export const HOT_WINDOW_HOURS = HOT_DEFAULTS.windowHours;
/** Histórico de pinos do assunto considerado para o teto e a dispensa. */
const HISTORY_HOURS = 24;

const HOUR_MS = 3_600_000;
const LIVE = new Set(["published", "updated"]);

/** Matéria de um assunto quente (qualquer status: o domínio filtra). */
export interface HotArticle {
  id: string;
  topicId: string;
  status: string;
  sponsored: boolean;
  /** Capa aprovada de verdade (R39). */
  hasCover: boolean;
  sectionSlug: string;
  /** Editoria de topo (a de `editoria.lead`); igual a `sectionSlug` quando já é de topo. */
  sectionRoot: string;
  newsScope: NewsScope | null;
  nationalCommotion: boolean;
  confidenceScore: number;
  publishedAt: Date | null;
}

/** Linha de `featured_items` como o domínio enxerga. */
export interface PinRecord {
  id: string;
  kind: "manual" | "hot";
  slotKey: string;
  sectionSlug: string | null;
  articleId: string;
  topicId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  endedAt: Date | null;
  dismissedAt: Date | null;
}

export interface NewHotPin {
  slotKey: string;
  sectionSlug: string | null;
  articleId: string;
  topicId: string;
  startsAt: Date;
  endsAt: Date;
  /** Portais distintos que sustentam o assunto agora ("Em alta · n portais" no Estúdio). */
  sources: number;
  position: number;
}

/** Porta de banco (service role, `src/lib/db/hot-pin-store.ts`). */
export interface HotPinRepo {
  hotEnabled(): Promise<boolean>;
  /** `featured.hot_min_sources`; `null` = padrão (3). */
  minSources(): Promise<number | null>;
  /** Sinais com assunto vistos desde `since`. */
  signals(since: Date): Promise<FrontSignal[]>;
  slots(): Promise<{ key: string; capacity: number }[]>;
  articlesOfTopics(topicIds: string[]): Promise<HotArticle[]>;
  /** Pinos vigentes (manual e quente): não encerrados, já começados e não vencidos em `now`. */
  activePins(now: Date): Promise<PinRecord[]>;
  /** Pinos quentes dos assuntos (qualquer estado) criados ou dispensados desde `since`. */
  topicHotPins(topicIds: string[], since: Date): Promise<PinRecord[]>;
  insertPin(pin: NewHotPin): Promise<void>;
  extendPin(id: string, endsAt: Date, sources: number): Promise<void>;
  endPin(id: string, at: Date): Promise<void>;
}

export interface HotPinDeps {
  repo: HotPinRepo;
  now: () => Date;
}

export interface HotPinReport {
  pinned: number;
  renewed: number;
  skipped: number;
}

/** R21: só `cuiaba` e `mt`; `national` só com comoção nacional. Escopo desconhecido não entra. */
export function hotScopeEligible(a: Pick<HotArticle, "newsScope" | "nationalCommotion">): boolean {
  if (a.newsScope === "cuiaba" || a.newsScope === "mt") return true;
  return a.newsScope === "national" && a.nationalCommotion;
}

/** Pode ocupar posição como pauta quente: publicada, não patrocinada, com capa, no escopo. */
export function hotEligible(a: HotArticle): boolean {
  return LIVE.has(a.status) && !a.sponsored && a.hasCover && hotScopeEligible(a);
}

/** A melhor matéria publicada do assunto: maior confiança, depois a mais recente. */
export function bestHotArticle(articles: readonly HotArticle[]): HotArticle | null {
  const ok = articles.filter(hotEligible);
  ok.sort(
    (a, b) =>
      b.confidenceScore - a.confidenceScore ||
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return ok[0] ?? null;
}

const maxDate = (ds: (Date | null)[]): Date | null =>
  ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);

export async function applyHotPins(deps: HotPinDeps): Promise<HotPinReport> {
  const report: HotPinReport = { pinned: 0, renewed: 0, skipped: 0 };
  const { repo } = deps;
  const now = deps.now();
  if (!(await repo.hotEnabled())) return report;

  const configured = await repo.minSources();
  const minSources =
    typeof configured === "number" && Number.isFinite(configured) && configured >= 1
      ? Math.round(configured)
      : HOT_DEFAULTS.minSources;
  const opts = { minSources, windowHours: HOT_WINDOW_HOURS, maxRank: HOT_DEFAULTS.maxRank };

  const signals = await repo.signals(new Date(now.getTime() - HOT_WINDOW_HOURS * HOUR_MS));
  const hot = detectHot(signals, now, opts);
  if (hot.length === 0) return report;

  const topicIds = hot.map((h) => h.topicId);
  const [articles, active, history, slotRows] = await Promise.all([
    repo.articlesOfTopics(topicIds),
    repo.activePins(now),
    repo.topicHotPins(topicIds, new Date(now.getTime() - HISTORY_HOURS * HOUR_MS)),
    repo.slots(),
  ]);
  const capacity = (key: string) =>
    slotRows.find((s) => s.key === key)?.capacity ??
    DEFAULT_SLOTS.find((s) => s.key === key)?.capacity ??
    1;
  // Pinos vigentes, atualizados conforme este passo grava (o próximo assunto enxerga as vagas).
  const live = [...active];

  for (const topic of hot) {
    const past = history.filter((p) => p.topicId === topic.topicId);
    const dismissedAt = maxDate(past.map((p) => p.dismissedAt));
    if (dismissedAt) {
      // Dispensado: só um sinal inteiro posterior à dispensa traz o assunto de volta.
      const fresh = detectHot(
        signals.filter((s) => s.topicId === topic.topicId && s.seenAt > dismissedAt),
        now,
        opts,
      );
      if (fresh.length === 0) {
        report.skipped += 1;
        continue;
      }
    }

    const best = bestHotArticle(articles.filter((a) => a.topicId === topic.topicId));
    if (!best) {
      report.skipped += 1;
      continue;
    }

    // Teto de 12 h desde o primeiro pino do episódio (o que veio depois da última dispensa).
    const episode = past.filter(
      (p) => !p.dismissedAt && (!dismissedAt || p.startsAt > dismissedAt),
    );
    const startedAt = episode.reduce((m, p) => (p.startsAt < m ? p.startsAt : m), now);
    const ceiling = startedAt.getTime() + HOT_PIN_MAX_HOURS * HOUR_MS;
    if (now.getTime() >= ceiling) {
      report.skipped += 1;
      continue;
    }
    const endsAt = new Date(Math.min(now.getTime() + HOT_PIN_HOURS * HOUR_MS, ceiling));

    /** Ocupa (ou renova) a posição; `true` quando o assunto está nela depois do passo. */
    const occupy = async (slotKey: string, sectionSlug: string | null): Promise<boolean> => {
      const inSlot = live.filter((p) => p.slotKey === slotKey && p.sectionSlug === sectionSlug);
      const manual = inSlot.filter((p) => p.kind === "manual").length;
      const cap = capacity(slotKey);
      const mine = inSlot.find((p) => p.kind === "hot" && p.topicId === topic.topicId);
      if (manual >= cap) {
        // Manual vence: o quente desta posição (se houver) só vence sozinho.
        report.skipped += 1;
        return false;
      }
      if (mine && mine.articleId === best.id) {
        if (!mine.endsAt || endsAt > mine.endsAt) {
          await repo.extendPin(mine.id, endsAt, topic.sources);
          mine.endsAt = endsAt;
          report.renewed += 1;
        }
        return true;
      }
      if (mine) {
        // A matéria do pino deixou de ser a melhor (saiu do ar, por exemplo): troca.
        await repo.endPin(mine.id, now);
        live.splice(live.indexOf(mine), 1);
      }
      const others = live.filter(
        (p) =>
          p.slotKey === slotKey &&
          p.sectionSlug === sectionSlug &&
          !(p.kind === "hot" && p.topicId === topic.topicId),
      ).length;
      if (others >= cap) {
        report.skipped += 1;
        return false;
      }
      const pin: NewHotPin = {
        slotKey,
        sectionSlug,
        articleId: best.id,
        topicId: topic.topicId,
        startsAt: now,
        endsAt,
        sources: topic.sources,
        position: others,
      };
      await repo.insertPin(pin);
      live.push({
        id: `novo:${slotKey}:${sectionSlug ?? ""}:${topic.topicId}`,
        kind: "hot",
        slotKey,
        sectionSlug,
        articleId: best.id,
        topicId: topic.topicId,
        startsAt: now,
        endsAt,
        endedAt: null,
        dismissedAt: null,
      });
      report.pinned += 1;
      return true;
    };

    const lead = await occupy("home.lead", null);
    await occupy("editoria.lead", best.sectionRoot);
    // A manchete já mostra a matéria; o destaque só recebe o assunto que ficou fora dela (a home
    // nunca repete a manchete nos destaques, R40).
    if (!lead) await occupy("home.destaques", null);
  }
  return report;
}
