import "server-only";
import type { CriticalKind } from "@/lib/approvals/approvals";
import { CRITICAL_KINDS } from "@/lib/approvals/approvals";
import { parseApprovalTarget, type ApprovalTarget } from "@/lib/approvals/targets";
import type { DbClient } from "@/lib/db/client";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras da caixa de aprovações (P5-T1) com a sessão da pessoa: `approvals_read_staff` deixa
 * toda a equipe ler; decidir é outra história (`approvals_decide`, `approval_apply`).
 */

export interface ApprovalItem {
  id: string;
  kind: CriticalKind;
  targetRef: string;
  target: ApprovalTarget;
  justification: string;
  requestedBy: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null } | null;
  status: "pending" | "approved" | "rejected" | "applied";
  createdAt: string;
  decidedAt: string | null;
}

export interface ApprovalsInbox {
  pending: ApprovalItem[];
  recent: ApprovalItem[];
}

const isKind = (k: string): k is CriticalKind => (CRITICAL_KINDS as readonly string[]).includes(k);
const isStatus = (s: string): s is ApprovalItem["status"] =>
  s === "pending" || s === "approved" || s === "rejected" || s === "applied";

const COLUMNS =
  "id, kind, target_ref, justification, requested_by, approved_by, status, created_at, decided_at";

type Row = {
  id: string;
  kind: string;
  target_ref: string;
  justification: string;
  requested_by: string;
  approved_by: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
};

async function names(db: DbClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (uuids.length === 0) return new Map();
  const { data, error } = await db.from("profiles").select("id, display_name").in("id", uuids);
  if (error) throw new Error(`approvals profiles: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.id, r.display_name]));
}

function mapRows(rows: Row[], people: Map<string, string>): ApprovalItem[] {
  return rows.flatMap((r) => {
    if (!isKind(r.kind) || !isStatus(r.status)) return [];
    return [
      {
        id: r.id,
        kind: r.kind,
        targetRef: r.target_ref,
        target: parseApprovalTarget(r.target_ref),
        justification: r.justification,
        requestedBy: { id: r.requested_by, name: people.get(r.requested_by) ?? null },
        approvedBy: r.approved_by
          ? { id: r.approved_by, name: people.get(r.approved_by) ?? null }
          : null,
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      },
    ];
  });
}

/** Pedidos abertos (mais antigos primeiro) e as últimas decisões. */
export async function approvalsInbox(recentLimit = 20, db?: DbClient): Promise<ApprovalsInbox> {
  const client = db ?? (await studioContext()).db;
  const [pending, recent] = await Promise.all([
    client.from("approvals").select(COLUMNS).eq("status", "pending").order("created_at"),
    client
      .from("approvals")
      .select(COLUMNS)
      .neq("status", "pending")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(recentLimit),
  ]);
  if (pending.error) throw new Error(`approvals: ${pending.error.message}`);
  if (recent.error) throw new Error(`approvals: ${recent.error.message}`);
  const rows = [...(pending.data ?? []), ...(recent.data ?? [])];
  const people = await names(
    client,
    rows.flatMap((r) => [r.requested_by, r.approved_by]),
  );
  return {
    pending: mapRows(pending.data ?? [], people),
    recent: mapRows(recent.data ?? [], people),
  };
}

/** Pedidos abertos de um alvo (prefixo), para a faixa "aguardando aprovação". */
export async function pendingApprovalsFor(
  targetPrefix: string,
  db?: DbClient,
): Promise<ApprovalItem[]> {
  const client = db ?? (await studioContext()).db;
  const escaped = targetPrefix.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await client
    .from("approvals")
    .select(COLUMNS)
    .eq("status", "pending")
    .like("target_ref", `${escaped}%`)
    .order("created_at");
  if (error) throw new Error(`approvals: ${error.message}`);
  const people = await names(
    client,
    (data ?? []).map((r) => r.requested_by),
  );
  return mapRows(data ?? [], people);
}
