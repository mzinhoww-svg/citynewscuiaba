import Link from "next/link";
import { APPROVALS_TEXT as T, targetText } from "@/content/pt-BR/approvals";
import type { ApprovalItem } from "@/lib/db/queries/approvals";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface ApprovalBannerProps {
  approvals: ApprovalItem[];
  currentUserId: string;
  /** Link para decidir (padrão: a caixa de aprovações). */
  href?: string;
  className?: string;
}

/**
 * Faixa "aguardando segunda aprovação" das telas que propõem mudança crítica (regras,
 * contingência). Server Component: só texto, ícone e link; a decisão fica na caixa de
 * aprovações. Quem pediu lê que a aprovação precisa ser de outra pessoa.
 */
export function ApprovalBanner({
  approvals,
  currentUserId,
  href = "/estudio/control/aprovacoes",
  className,
}: ApprovalBannerProps) {
  if (approvals.length === 0) return null;
  const own = approvals.some((a) => a.requestedBy.id === currentUserId);
  return (
    <section
      aria-label={T.banner.title(approvals.length)}
      className={cx(
        "flex flex-col gap-2 rounded-lg border border-warn bg-atencao-soft px-4 py-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 type-body font-semibold text-strong">
        <Icon name="shield" size={18} className="text-warn" />
        {T.banner.title(approvals.length)}
      </p>
      <ul className="flex flex-col gap-1">
        {approvals.map((a) => (
          <li key={a.id} className="type-body text-strong">
            {T.banner.line(targetText(a.target), a.requestedBy.name ?? T.someone)}
          </li>
        ))}
      </ul>
      {own && <p className="type-meta text-strong">{T.waitOther}.</p>}
      <Link href={href} className="type-body font-medium text-link underline">
        {T.banner.open}
      </Link>
    </section>
  );
}
