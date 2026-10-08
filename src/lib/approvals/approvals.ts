/**
 * Aprovações de mudança crítica (spec mestre §8, plano P5-T1; painel de fontes D-F3/D-F4/D-F5).
 * Decisão só em nome próprio, por papel que aprova o tipo, e final; quem pede pode decidir o
 * próprio pedido (A-128: uma pessoa pede, aprova e aplica; `requested_by` e `approved_by` ficam
 * registrados). As mesmas regras valem no banco (`guard_approvals` e RLS `approvals_decide`); este
 * módulo só traduz os resultados em `Result` com erros tipados. Nada aqui aplica a mudança: quem
 * aplica é o dono do alvo (ex.: `source_admin_update`, que consome a aprovação no trigger).
 */
import type { DbClient } from "@/lib/db/client";
import { err, ok, type Result } from "@/lib/result";

/**
 * Tipos de mudança crítica (spec §8). A mesma lista vale no banco (`approval_kinds()`, 0029);
 * `push.highlight` e `push.resume` são do PWA (spec 2026-09-28, D-P08) e ficam reservados aqui.
 */
export const CRITICAL_KINDS = [
  "rules.activate",
  "prompt.publish",
  "rec.weights",
  "role.admin",
  "safety.disable",
  "force_review.disable",
  "push.urgent",
  "push.highlight",
  "push.resume",
  "source.critical",
  "push.highlight",
  "push.resume",
  // Papel numa ação só (0158, A-150): nascem já aprovados e aplicados por quem tem users.manage.
  "role.grant",
  "role.revoke",
] as const;
export type CriticalKind = (typeof CRITICAL_KINDS)[number];

export type ApprovalStatus = "pending" | "approved" | "rejected" | "applied";

export interface ApprovalRow {
  id: string;
  kind: string;
  targetRef: string;
  justification: string;
  requestedBy: string;
  approvedBy: string | null;
  status: ApprovalStatus;
  createdAt: string;
}

export type DecideOutcome = "ok" | "forbidden" | "not_pending";

/** Acesso ao armazenamento das aprovações (Supabase na produção, memória nos testes). */
export interface ApprovalsPort {
  currentUser(): Promise<string | null>;
  insert(row: {
    kind: CriticalKind;
    targetRef: string;
    justification: string;
    requestedBy: string;
  }): Promise<{ id: string }>;
  get(id: string): Promise<ApprovalRow | null>;
  /** Decide um pedido ainda pendente, em nome de `by`. */
  decide(id: string, status: "approved" | "rejected", by: string): Promise<DecideOutcome>;
  listPending(targetPrefix: string): Promise<ApprovalRow[]>;
  /**
   * Aplica um pedido aprovado (regras, flags de segurança) e o marca `applied`. No banco é
   * `approval_apply` (0029); só quem aprovou aplica, e só dentro de 24 h da decisão.
   */
  apply(id: string): Promise<ApplyOutcome>;
}

export type ApplyOutcome =
  | { applied: true }
  | {
      applied: false;
      reason:
        "already_applied" | "not_approved" | "expired" | "forbidden" | "not_found" | "unsupported";
    };

export type ApproveError = "forbidden" | "not_pending";
export type ApplyError = Exclude<ApplyOutcome, { applied: true }>["reason"];

export interface Approvals {
  requestApproval(input: {
    kind: CriticalKind;
    targetRef: string;
    justification: string;
  }): Promise<Result<{ id: string }, "invalid">>;
  approve(input: { id: string }): Promise<Result<void, ApproveError>>;
  reject(input: { id: string; reason: string }): Promise<Result<void, ApproveError | "invalid">>;
  pending(targetPrefix: string): Promise<ApprovalRow[]>;
  /** Aprova e aplica de uma vez (a decisão fica registrada mesmo se a aplicação falhar). */
  approveAndApply(input: { id: string }): Promise<Result<void, ApproveError | ApplyError>>;
}

const isKind = (k: string): k is CriticalKind => (CRITICAL_KINDS as readonly string[]).includes(k);

export function createApprovalsWith(port: ApprovalsPort): Approvals {
  const decide = async (
    id: string,
    status: "approved" | "rejected",
  ): Promise<Result<void, ApproveError>> => {
    const me = await port.currentUser();
    if (!me) return err("forbidden");
    const row = await port.get(id);
    if (!row) return err("not_pending");
    if (row.status !== "pending") return err("not_pending");
    const outcome = await port.decide(id, status, me);
    return outcome === "ok" ? ok(undefined) : err(outcome);
  };

  return {
    async requestApproval({ kind, targetRef, justification }) {
      if (!isKind(kind) || !targetRef.trim() || !justification.trim()) return err("invalid");
      const me = await port.currentUser();
      if (!me) return err("invalid");
      const { id } = await port.insert({
        kind,
        targetRef: targetRef.trim(),
        justification: justification.trim(),
        requestedBy: me,
      });
      return ok({ id });
    },
    approve: ({ id }) => decide(id, "approved"),
    async reject({ id, reason }) {
      if (!reason.trim()) return err("invalid");
      return decide(id, "rejected");
    },
    pending: (prefix) => port.listPending(prefix),
    async approveAndApply({ id }) {
      const row = await port.get(id);
      if (row?.status === "applied") return err("already_applied");
      // Já aprovado e ainda não aplicado (ex.: a aplicação falhou antes): só aplica.
      if (row?.status !== "approved") {
        const r = await decide(id, "approved");
        if (!r.ok) return r;
      }
      const applied = await port.apply(id);
      return applied.applied ? ok(undefined) : err(applied.reason);
    },
  };
}

type Row = {
  id: string;
  kind: string;
  target_ref: string;
  justification: string;
  requested_by: string;
  approved_by: string | null;
  status: string;
  created_at: string;
};

const COLUMNS =
  "id, kind, target_ref, justification, requested_by, approved_by, status, created_at";

function mapRow(r: Row): ApprovalRow {
  return {
    id: r.id,
    kind: r.kind,
    targetRef: r.target_ref,
    justification: r.justification,
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    status: r.status as ApprovalStatus,
    createdAt: r.created_at,
  };
}

/** `%` e `_` literais no prefixo do `like`. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Porta sobre o cliente com a sessão da pessoa (RLS e `guard_approvals` valem). */
export function supabaseApprovalsPort(db: DbClient): ApprovalsPort {
  return {
    async currentUser() {
      const { data } = await db.auth.getUser();
      return data.user?.id ?? null;
    },
    async insert(row) {
      const { data, error } = await db
        .from("approvals")
        .insert({
          kind: row.kind,
          target_ref: row.targetRef,
          justification: row.justification,
          requested_by: row.requestedBy,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`approvals: ${error?.message ?? "sem retorno"}`);
      return { id: data.id };
    },
    async get(id) {
      const { data, error } = await db.from("approvals").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`approvals: ${error.message}`);
      return data ? mapRow(data) : null;
    },
    async decide(id, status, by) {
      const { data, error } = await db
        .from("approvals")
        .update({ status, approved_by: by })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
      if (error) {
        if (/decisão já tomada/.test(error.message)) return "not_pending";
        if (error.code === "42501") return "forbidden";
        throw new Error(`approvals: ${error.message}`);
      }
      // 0 linhas: a RLS `approvals_decide` escondeu o pedido (papel sem permissão de aprovar) ou
      // alguém decidiu no meio tempo.
      if ((data ?? []).length > 0) return "ok";
      const now = await this.get(id);
      return now && now.status !== "pending" ? "not_pending" : "forbidden";
    },
    async listPending(prefix) {
      const { data, error } = await db
        .from("approvals")
        .select(COLUMNS)
        .eq("status", "pending")
        .like("target_ref", `${escapeLike(prefix)}%`)
        .order("created_at");
      if (error) throw new Error(`approvals: ${error.message}`);
      return (data ?? []).map(mapRow);
    },
    async apply(id) {
      const { data, error } = await db.rpc("approval_apply", { p_id: id });
      if (error) {
        if (error.code === "P0002") return { applied: false, reason: "not_found" };
        if (/expirou/.test(error.message)) return { applied: false, reason: "expired" };
        if (/não aprovado/.test(error.message)) return { applied: false, reason: "not_approved" };
        if (/não se aplica/.test(error.message)) return { applied: false, reason: "unsupported" };
        if (error.code === "42501") return { applied: false, reason: "forbidden" };
        throw new Error(`approvals: ${error.message}`);
      }
      const out = data as { applied?: boolean; reason?: string } | null;
      if (out?.applied) return { applied: true };
      return { applied: false, reason: "already_applied" };
    },
  };
}

export function createApprovals(db: DbClient): Approvals {
  return createApprovalsWith(supabaseApprovalsPort(db));
}
