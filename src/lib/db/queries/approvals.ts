import "server-only";
import { isCriticalKind, type CriticalKind } from "@/lib/approvals/kinds";
import { studioContext } from "@/lib/studio/context";

export interface ApprovalRow {
  id: string;
  kind: CriticalKind;
  targetRef: string;
  justification: string;
  status: string;
  createdAt: string;
  requestedBy: string;
  requesterName: string | null;
  decidedBy: string | null;
  deciderName: string | null;
}

/**
 * Pedidos de aprovação (Control Center · Aprovações): pendentes, mais antigos primeiro, e as
 * últimas 20 decisões. Lê com a sessão da pessoa (RLS: só a equipe vê `approvals`). Tipos fora
 * da lista de mudanças críticas (linhas antigas ou de teste) ficam de fora.
 */
export async function listApprovals(): Promise<{ pending: ApprovalRow[]; recent: ApprovalRow[] }> {
  const { db } = await studioContext();
  const cols = "id, kind, target_ref, justification, status, created_at, requested_by, approved_by";
  const [pending, recent] = await Promise.all([
    db
      .from("approvals")
      .select(cols)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100),
    db
      .from("approvals")
      .select(cols)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (pending.error) throw new Error(`aprovações: ${pending.error.message}`);
  if (recent.error) throw new Error(`aprovações: ${recent.error.message}`);

  const rows = [...(pending.data ?? []), ...(recent.data ?? [])];
  const people = [
    ...new Set(
      rows.flatMap((r) => (r.approved_by ? [r.requested_by, r.approved_by] : [r.requested_by])),
    ),
  ];
  const names = new Map<string, string>();
  if (people.length > 0) {
    const { data, error } = await db.from("profiles").select("id, display_name").in("id", people);
    if (error) throw new Error(`aprovações (pessoas): ${error.message}`);
    for (const p of data ?? []) names.set(p.id, p.display_name);
  }

  const view = (r: (typeof rows)[number]): ApprovalRow[] =>
    isCriticalKind(r.kind)
      ? [
          {
            id: r.id,
            kind: r.kind,
            targetRef: r.target_ref,
            justification: r.justification,
            status: r.status,
            createdAt: r.created_at,
            requestedBy: r.requested_by,
            requesterName: names.get(r.requested_by) ?? null,
            decidedBy: r.approved_by,
            deciderName: r.approved_by ? (names.get(r.approved_by) ?? null) : null,
          },
        ]
      : [];
  return {
    pending: (pending.data ?? []).flatMap(view),
    recent: (recent.data ?? []).flatMap(view),
  };
}
