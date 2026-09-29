import Link from "next/link";
import { clockTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { InlineAlert } from "../../ui/InlineAlert";

export interface PushBannersProps {
  paused: { on: boolean; by: { name: string } | null; at: string | null; reason: string | null };
  /** Pedidos aguardando a aprovação da pessoa (0 esconde a faixa). */
  pending: number;
  /** Nomes das variáveis VAPID ausentes (nunca valores, D-P25). */
  vapidMissing: string[];
  /** Só quem configura vê a faixa técnica. */
  showVapid?: boolean;
  basePath?: string;
  className?: string;
}

/**
 * Faixas do cabeçalho de A09 (spec §10.3, §10.5, D-P25): envios pausados (quem, quando, motivo),
 * pendentes de aprovação com link para a fila e chaves VAPID ausentes. Texto sempre; a cor só
 * reforça.
 */
export function PushBanners({
  paused,
  pending,
  vapidMissing,
  showVapid = false,
  basePath = "/estudio/admin/notificacoes",
  className,
}: PushBannersProps) {
  const items: React.ReactNode[] = [];
  if (paused.on)
    items.push(
      <InlineAlert key="paused" tone="warn" role="status">
        {paused.by && paused.at
          ? T.banners.paused(paused.by.name, clockTime(paused.at), paused.reason ?? "")
          : T.banners.pausedShort}
      </InlineAlert>,
    );
  if (pending > 0)
    items.push(
      <InlineAlert
        key="pending"
        tone="info"
        role="status"
        action={
          <Link
            href={`${basePath}/fila`}
            className="text-16 font-medium text-link underline-offset-4 hover:underline"
          >
            {T.banners.pendingLink}
          </Link>
        }
      >
        {T.banners.pending(pending)}
      </InlineAlert>,
    );
  if (showVapid && vapidMissing.length > 0)
    items.push(
      <InlineAlert key="vapid" tone="error" role="status">
        {T.banners.vapidMissing(vapidMissing)}
      </InlineAlert>,
    );
  if (items.length === 0) return null;
  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}>
      {items}
    </div>
  );
}
