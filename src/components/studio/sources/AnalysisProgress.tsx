import { WIZARD } from "@/content/pt-BR/sources-admin-detail";
import type { LinkAnalysisFresh } from "@/lib/sources/analyze";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

const T = WIZARD.progress;

export interface AnalysisProgressProps {
  /** `running` enquanto a ação roda; `done` com o resultado; `idle` não mostra nada. */
  phase: "idle" | "running" | "done";
  analysis?: LinkAnalysisFresh | null;
  className?: string;
}

const STRATEGY_TEXT: Record<string, string> = {
  rss: "RSS",
  atom: "Atom",
  jsonfeed: "JSON Feed",
  sitemap_news: "sitemap de notícias",
  page_list: "lista de matérias da página",
  page_article: "página única",
};

const pathOf = (url: string | null): string => {
  if (!url) return "/";
  try {
    const u = new URL(url);
    return u.pathname === "" ? "/" : u.pathname;
  } catch {
    return url;
  }
};

/** Linhas de progresso a partir do resultado da análise ("Lendo robots.txt… ok"). */
export function progressLines(a: LinkAnalysisFresh): { label: string; result: string }[] {
  const s = a.discovery.strategy;
  const found =
    s === "page_list" || s === "page_article"
      ? T.found(STRATEGY_TEXT[s] ?? s, pathOf(a.discovery.finalUrl))
      : T.found(STRATEGY_TEXT[s] ?? s, pathOf(a.discovery.feedUrl));
  const lines: { label: string; result: string }[] = [
    { label: T.robots, result: T.ok },
    { label: T.discovery, result: found },
    { label: T.test, result: T.items(a.preview.items.length) },
    { label: T.preview, result: a.preview.items.length > 0 ? T.ok : T.notFound },
  ];
  if (a.aiStatus === "ok") lines.push({ label: T.ai, result: T.aiOk });
  else if (a.aiStatus !== "disabled") lines.push({ label: T.ai, result: T.aiSkipped });
  return lines;
}

/**
 * Progresso textual da análise, anunciado em `aria-live="polite"` (o único `status` do assistente):
 * enquanto roda, uma linha; depois, uma por etapa com o resultado.
 */
export function AnalysisProgress({ phase, analysis, className }: AnalysisProgressProps) {
  if (phase === "idle") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={T.label}
      className={cx(
        "flex flex-col gap-2 rounded-lg border border-line-section bg-card-white p-4",
        className,
      )}
    >
      {phase === "running" || !analysis ? (
        <p className="flex items-center gap-2 type-body text-strong">
          <Icon name="refresh-cw" size={18} className="text-meta motion-safe:animate-spin" />
          {T.running}
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {progressLines(analysis).map((l) => (
            <li key={l.label} className="flex items-start gap-2 type-body text-strong">
              <Icon name="check" size={18} className="mt-1 shrink-0 text-service" />
              <span>
                {l.label}… <span className="font-semibold">{l.result}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
