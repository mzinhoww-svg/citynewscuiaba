import Link from "next/link";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface SourceApprovalsNoticeProps {
  /** Total de mudanças críticas aguardando segunda aprovação (spec §7.5, D-F3). */
  count: number;
  /** Link para a lista já filtrada por `pendente=1`. */
  href: string;
  className?: string;
}

/**
 * Banner de aprovações pendentes no cabeçalho da lista de fontes (spec §8, O03). Nunca depende só
 * de cor: ícone decorativo + texto.
 *
 * ```tsx
 * <SourceApprovalsNotice count={2} href="/estudio/control/fontes?pendente=1" />
 * ```
 */
export function SourceApprovalsNotice({ count, href, className }: SourceApprovalsNoticeProps) {
  if (count <= 0) return null;
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-lg border border-atencao bg-atencao-soft px-4 py-3",
        className,
      )}
    >
      <Icon name="circle-alert" size={20} className="text-warn" />
      <p className="type-body text-strong">
        {count === 1 ? T.approvalsNotice.one : T.approvalsNotice.many(count)}
      </p>
      <Link
        href={href}
        className="ml-auto type-body font-semibold text-link underline-offset-4 hover:underline"
      >
        {T.approvalsNotice.review}
      </Link>
    </div>
  );
}
