import Link from "next/link";
import {
  CRITICAL_FIELD_LABEL,
  IMAGE_POLICY_LABEL,
  REPUBLISH_POLICY_LABEL,
  RELIABILITY_LABEL,
} from "@/content/pt-BR/sources-admin";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import type { SourceApprovalRow } from "@/lib/db/queries/sources-admin";
import { Button } from "../../ui/Button";
import { InlineAlert } from "../../ui/InlineAlert";

export interface SourceApprovalsNoticeProps {
  approvals: readonly SourceApprovalRow[];
  /** Quantos pedidos listar antes de "e mais N". */
  limit?: number;
}

/** Valor do pedido em texto legível ("reproduction" vira "Reprodução com crédito"). */
export function criticalValueLabel(field: string, value: string): string {
  const table: Record<string, Record<string, string>> = {
    image_policy: IMAGE_POLICY_LABEL,
    republish_policy: REPUBLISH_POLICY_LABEL,
    reliability: RELIABILITY_LABEL,
  };
  if (field === "may_be_sole_source") return value === "true" ? "Sim" : "Não";
  if (field === "status" && value === "paused") return "Desbloquear (volta pausada)";
  return table[field]?.[value] ?? value;
}

/**
 * Aviso das mudanças críticas que esperam a segunda aprovação: lista os pedidos (fonte, campo,
 * valor pedido e quem pediu) e leva a Aprovações, onde outra pessoa decide. Sem pedidos, não
 * renderiza nada.
 */
export function SourceApprovalsNotice({ approvals, limit = 3 }: SourceApprovalsNoticeProps) {
  if (approvals.length === 0) return null;
  const t = T.approvals;
  const shown = approvals.slice(0, limit);
  const rest = approvals.length - shown.length;
  return (
    <InlineAlert
      tone="warn"
      role="none"
      title={t.title(approvals.length)}
      action={
        <Button href="/estudio/control/aprovacoes" size="sm" variant="outline">
          {t.review}
        </Button>
      }
    >
      <p className="type-meta">{t.intro}</p>
      <ul aria-label={t.title(approvals.length)} className="mt-2 flex flex-col gap-1 type-body">
        {shown.map((a) => (
          <li key={a.id}>
            <Link
              href={`/estudio/control/fontes/${a.sourceId}`}
              className="font-semibold text-strong underline underline-offset-4"
            >
              {a.sourceName ?? t.unknownSource}
            </Link>{" "}
            {t.field(
              CRITICAL_FIELD_LABEL[a.field] ?? a.field,
              criticalValueLabel(a.field, a.value),
            )}{" "}
            <span className="text-meta">· {t.by(a.requesterName ?? t.unknownPerson)}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="mt-1 type-meta">{t.more(rest)}</p>}
    </InlineAlert>
  );
}
