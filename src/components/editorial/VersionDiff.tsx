import type { DiffPart } from "@/lib/diff/words";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { cx } from "../cx";

export interface VersionDiffProps {
  parts: DiffPart[];
  className?: string;
}

const KEEP = 120;

/** Trechos iguais longos viram "início … fim" para destacar só o que mudou. */
function shorten(text: string): string {
  if (text.length <= KEEP * 2 + 20) return text;
  return `${text.slice(0, KEEP)} … ${text.slice(-KEEP)}`;
}

/**
 * Diferença textual simplificada entre duas versões publicadas (P04): acréscimos sublinhados,
 * remoções riscadas, cada um com aviso textual para leitores de tela (nada depende só de cor).
 *
 * ```tsx
 * <VersionDiff parts={diffWords(antes, depois)} />
 * ```
 */
export function VersionDiff({ parts, className }: VersionDiffProps) {
  return (
    <p className={cx("reading-body whitespace-pre-line text-body", className)}>
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{shorten(p.text)}</span>
        ) : p.type === "add" ? (
          <ins
            key={i}
            className="bg-cerrado-soft text-strong underline decoration-2 underline-offset-4"
          >
            <span className="sr-only">[{ARTICLE.added}: </span>
            {p.text}
            <span className="sr-only">]</span>
          </ins>
        ) : (
          <del key={i} className="bg-erro-soft text-strong line-through decoration-2">
            <span className="sr-only">[{ARTICLE.removed}: </span>
            {p.text}
            <span className="sr-only">]</span>
          </del>
        ),
      )}
    </p>
  );
}
