import Link from "next/link";
import type { ArticleNote } from "@/lib/db/queries/types";
import { formatDateTime } from "@/lib/format/date";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface NoteProps {
  note: ArticleNote;
  /** Histórico público (âncora da versão). */
  historyHref: string;
  className?: string;
}

function Note({
  note,
  historyHref,
  className,
  title,
  tone,
}: NoteProps & { title: string; tone: string }) {
  return (
    <aside
      aria-label={title}
      className={cx("flex items-start gap-3 border-l-2 px-4 py-3", tone, className)}
    >
      <Icon
        name={note.kind === "correction" ? "circle-alert" : "refresh-cw"}
        size={20}
        className="mt-0.5 shrink-0"
      />
      <div className="flex flex-col gap-1">
        <p className="type-meta font-bold text-strong">
          {title}{" "}
          <time dateTime={note.at} className="font-medium text-meta">
            {ARTICLE.noteAt(formatDateTime(note.at))}
          </time>
        </p>
        <p className="type-body text-body">{note.note}</p>
        <Link
          href={`${historyHref}#v${note.version}`}
          className="inline-flex min-h-tap items-center self-start text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
        >
          {ARTICLE.seeChanges}
        </Link>
      </div>
    </aside>
  );
}

/**
 * Nota pública de atualização: o que mudou depois da publicação, com link para o histórico.
 *
 * ```tsx
 * <UpdateNote note={n} historyHref="/materia/x/historico" />
 * ```
 */
export function UpdateNote(props: NoteProps) {
  return (
    <Note {...props} title={ARTICLE.updateNote} tone="border-line-strong bg-section text-strong" />
  );
}

/**
 * Nota pública de correção (P03, /correcoes): texto da correção sempre visível no topo.
 *
 * ```tsx
 * <CorrectionNote note={n} historyHref="/materia/x/historico" />
 * ```
 */
export function CorrectionNote(props: NoteProps) {
  return (
    <Note {...props} title={ARTICLE.correctionNote} tone="border-accent bg-urucum-soft text-link" />
  );
}
