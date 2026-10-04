import type { ReactNode } from "react";
import { STRATEGY_TEXT, WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import type { LinkAnalysis } from "@/lib/sources/analyze";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export type AnalysisPhase = "idle" | "analyzing" | "done" | "failed";

export interface AnalysisProgressProps {
  phase: AnalysisPhase;
  analysis?: LinkAnalysis | null;
  /** Mensagem no lugar das etapas (duplicidade, com o link para a fonte existente). */
  message?: ReactNode;
  className?: string;
}

const FEED_STRATEGIES = new Set(["rss", "atom", "jsonfeed", "sitemap_news"]);

function pathOf(url: string | null): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** Linhas de progresso textual da análise (spec §8, O04a). */
export function analysisLines(a: LinkAnalysis): { text: string; ok: boolean }[] {
  const T = WIZARD_TEXT.progress;
  const lines: { text: string; ok: boolean }[] = [];
  const delay = a.discovery.robots.crawlDelaySec;
  lines.push({
    text: !a.discovery.robots.allowed ? T.robotsBlocked : delay ? T.robotsDelay(delay) : T.robotsOk,
    ok: a.discovery.robots.allowed,
  });
  const strategy = STRATEGY_TEXT[a.discovery.strategy];
  lines.push({
    text: FEED_STRATEGIES.has(a.discovery.strategy)
      ? T.feedFound(strategy, pathOf(a.discovery.feedUrl))
      : T.feedPage(strategy),
    ok: true,
  });
  lines.push({ text: T.tested(a.preview.items.length), ok: a.preview.items.length > 0 });
  if (a.preview.droppedForInjection > 0)
    lines.push({ text: T.dropped(a.preview.droppedForInjection), ok: false });
  return lines;
}

/**
 * Progresso da análise por link em `role="status"` + `aria-live="polite"` (a região existe desde o
 * início, para o leitor de tela anunciar cada mudança): "Lendo robots.txt… ok", "Procurando feed…
 * encontrado RSS em /feed", "Testando… 25 itens".
 */
export function AnalysisProgress({ phase, analysis, message, className }: AnalysisProgressProps) {
  const T = WIZARD_TEXT.progress;
  let lines: { text: string; ok: boolean | null }[] = [];
  if (phase === "analyzing")
    lines = [
      { text: T.robots, ok: null },
      { text: T.feed, ok: null },
      { text: T.testing, ok: null },
    ];
  else if (phase === "done" && analysis) lines = analysisLines(analysis);
  else if (phase === "failed") lines = [{ text: T.failed, ok: false }];

  const empty = lines.length === 0 && !message;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={phase === "analyzing" ? true : undefined}
      className={cx(
        empty
          ? "sr-only"
          : "flex flex-col gap-2 rounded-lg border border-line-section bg-card-white p-4",
        className,
      )}
    >
      {!empty && <p className="type-label text-strong">{T.title}</p>}
      {message}
      {lines.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l.text} className="flex items-start gap-2 type-body text-strong">
              <Icon
                name={l.ok === null ? "clock" : l.ok ? "check" : "circle-alert"}
                size={18}
                className={cx(
                  "mt-0.5 shrink-0",
                  l.ok === null ? "text-meta" : l.ok ? "text-service" : "text-warn",
                )}
              />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
