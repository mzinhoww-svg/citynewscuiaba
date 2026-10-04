import Link from "next/link";
import type { ReactNode } from "react";
import { STUDIO_PUSH_CARD_TEXT as T } from "@/content/pt-BR/studio-notifications";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface PushHomeCardProps {
  /** `null` quando o estado não carregou (o cartão mostra o aviso e o link). */
  data: { queued: number; pending: number; lastDelivery: string | null } | null;
  href: string;
  /** Opt-in das urgências neste navegador (Client Component injetado pela página). */
  optIn?: ReactNode;
  className?: string;
}

/**
 * Cartão "Notificações push" da home do Estúdio (descoberta do A09): fila, pendentes de
 * aprovação e última entrega, com link para a tela. O opt-in das urgências é um controle à parte.
 */
export function PushHomeCard({ data, href, optIn, className }: PushHomeCardProps) {
  return (
    <section
      aria-label={T.title}
      className={cx(
        "flex flex-col gap-3 rounded-md border border-line-control bg-card-white p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="bell" size={20} />
        <h2 className="type-nav-title text-strong">{T.title}</h2>
        <Link
          href={href}
          className="ml-auto inline-flex min-h-tap items-center gap-1 text-14 font-semibold text-link underline-offset-4 hover:underline"
        >
          {T.open}
          <Icon name="chevron-right" size={16} />
        </Link>
      </div>
      {data === null ? (
        <p className="type-body text-meta">{T.unavailable}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="type-meta text-meta">{T.queue}</dt>
            <dd className="type-screen-title text-strong">{data.queued}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.pending}</dt>
            <dd className="type-screen-title text-strong">{data.pending}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.lastDelivery}</dt>
            <dd className="text-16 text-strong">{data.lastDelivery ?? T.none}</dd>
          </div>
        </dl>
      )}
      {optIn}
    </section>
  );
}
