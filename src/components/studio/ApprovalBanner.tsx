import type { ReactNode } from "react";
import {
  APPROVAL_EFFECT_TEXT,
  APPROVAL_KIND_LABEL,
  APPROVALS_TEXT as T,
} from "@/content/pt-BR/approvals";
import type { ApprovalEffect, CriticalKind, ViewerStance } from "@/lib/approvals/kinds";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface ApprovalBannerProps {
  id: string;
  kind: CriticalKind;
  /** Alvo por extenso ("Regras, versão 7"). */
  targetLabel: string;
  justification: string;
  requesterName: string;
  /** Data e hora do pedido já formatadas ("28/09/2026, 14h30"). */
  requestedAt: string;
  effect: ApprovalEffect;
  /** Como quem vê se relaciona com o pedido: quem pediu nunca decide. */
  stance: ViewerStance;
  /** Papéis que decidem, por extenso (mostrado a quem só acompanha). */
  deciders: string;
  /** Botões Aprovar e Recusar (só para `stance = "decider"`). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Pedido de aprovação dupla de uma mudança crítica (spec §8; P5-T1). Server Component: recebe
 * os dados prontos e não conhece o banco. Mostra o que muda, o alvo, quem pediu e por quê, o
 * efeito da aprovação e, conforme a pessoa, as ações ou o motivo de não poder decidir.
 *
 * ```tsx
 * <ApprovalBanner id={a.id} kind="rules.activate" targetLabel="Regras, versão 7"
 *   justification="Serviços com 2 fontes" requesterName="Diego Prado" requestedAt="28/09/2026, 14h30"
 *   effect="activate" stance="decider" deciders="Administração, Editor-chefe"
 *   actions={<form>…</form>} />
 * ```
 */
export function ApprovalBanner({
  id,
  kind,
  targetLabel,
  justification,
  requesterName,
  requestedAt,
  effect,
  stance,
  deciders,
  actions,
  className,
}: ApprovalBannerProps) {
  const titleId = `aprovacao-${id}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cx(
        "flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4",
        className,
      )}
    >
      <p className="type-eyebrow text-eyebrow">{T.eyebrow}</p>
      <h3 id={titleId} className="type-section text-strong">
        {APPROVAL_KIND_LABEL[kind]}
      </h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 type-meta sm:grid-cols-[auto_1fr]">
        <dt className="text-meta">{T.target}</dt>
        <dd className="text-strong">{targetLabel}</dd>
        <dt className="text-meta">{T.requestedBy}</dt>
        <dd className="text-strong">
          {requesterName} · <span className="tabular-nums">{requestedAt}</span>
        </dd>
      </dl>
      <div className="flex flex-col gap-1">
        <p className="type-meta text-meta">{T.justification}</p>
        <blockquote className="border-l-4 border-line-section pl-3 type-body text-strong">
          {justification}
        </blockquote>
      </div>
      <p className="type-meta text-meta">{APPROVAL_EFFECT_TEXT[effect]}</p>
      {stance === "requester" ? (
        <p className="flex items-start gap-2 type-body text-warn">
          <Icon name="triangle-alert" size={20} className="mt-0.5 shrink-0" />
          <span>{T.requesterNote}</span>
        </p>
      ) : stance === "observer" ? (
        <p className="flex items-start gap-2 type-body text-meta">
          <Icon name="info" size={20} className="mt-0.5 shrink-0" />
          <span>{T.observerNote(deciders)}</span>
        </p>
      ) : (
        actions && <div className="flex flex-wrap gap-3">{actions}</div>
      )}
    </article>
  );
}
