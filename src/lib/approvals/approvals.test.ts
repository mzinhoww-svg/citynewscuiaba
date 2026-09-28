import { createApprovalsWith, type ApprovalRow, type ApprovalsPort } from "./approvals";
import { APPROVAL_ERROR_TEXT, CRITICAL_KINDS } from "./index";

const DIEGO = "u-diego";
const MARINA = "u-marina";

/** Porta em memória com as mesmas regras do banco (guard_approvals + RLS approvals_decide). */
function memoryPort(approvers: string[] = [MARINA]) {
  const rows = new Map<string, ApprovalRow>();
  let me: string | null = DIEGO;
  let n = 0;
  const port: ApprovalsPort = {
    async currentUser() {
      return me;
    },
    async insert(row) {
      const id = `ap-${++n}`;
      rows.set(id, {
        id,
        kind: row.kind,
        targetRef: row.targetRef,
        justification: row.justification,
        requestedBy: row.requestedBy,
        approvedBy: null,
        status: "pending",
        createdAt: new Date(2026, 8, 27, 14, n).toISOString(),
      });
      return { id };
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async decide(id, status, by) {
      const r = rows.get(id);
      if (!r) return "not_pending";
      if (r.requestedBy === by) return "self";
      if (!approvers.includes(by)) return "forbidden";
      if (r.status !== "pending") return "not_pending";
      rows.set(id, { ...r, status, approvedBy: by });
      return "ok";
    },
    async listPending(prefix) {
      return [...rows.values()].filter(
        (r) => r.status === "pending" && r.targetRef.startsWith(prefix),
      );
    },
  };
  return {
    port,
    rows,
    as(user: string | null) {
      me = user;
    },
  };
}

describe("aprovações (duas pessoas)", () => {
  it("pede com justificativa e devolve o id", async () => {
    const m = memoryPort();
    const a = createApprovalsWith(m.port);
    const r = await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:image_policy=reproduction",
      justification: "Acordo assinado em 20/09",
    });
    expect(r).toEqual({ ok: true, value: { id: "ap-1" } });
    expect(m.rows.get("ap-1")).toMatchObject({ requestedBy: DIEGO, status: "pending" });
  });

  it("justificativa vazia, alvo vazio ou tipo desconhecido é inválido", async () => {
    const a = createApprovalsWith(memoryPort().port);
    const base = { kind: "source.critical" as const, targetRef: "source:s1:x=y" };
    expect(await a.requestApproval({ ...base, justification: "   " })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await a.requestApproval({ ...base, targetRef: "", justification: "ok" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await a.requestApproval({
        kind: "qualquer" as never,
        targetRef: "x",
        justification: "ok",
      }),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("sem sessão não pede nada", async () => {
    const m = memoryPort();
    m.as(null);
    const r = await createApprovalsWith(m.port).requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:x=y",
      justification: "ok",
    });
    expect(r).toEqual({ ok: false, error: "invalid" });
  });

  it("quem pediu não aprova; outra pessoa com papel aprova; decisão é final", async () => {
    const m = memoryPort();
    const a = createApprovalsWith(m.port);
    await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:image_policy=reproduction",
      justification: "Acordo",
    });
    expect(await a.approve({ id: "ap-1" })).toEqual({ ok: false, error: "self_approval" });
    expect(APPROVAL_ERROR_TEXT.self_approval).toBe("A aprovação precisa ser de outra pessoa");
    m.as(MARINA);
    expect(await a.approve({ id: "ap-1" })).toEqual({ ok: true, value: undefined });
    expect(m.rows.get("ap-1")).toMatchObject({ status: "approved", approvedBy: MARINA });
    expect(await a.approve({ id: "ap-1" })).toEqual({ ok: false, error: "not_pending" });
  });

  it("papel sem segunda assinatura não aprova", async () => {
    const m = memoryPort([MARINA]);
    const a = createApprovalsWith(m.port);
    await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:a=b",
      justification: "j",
    });
    m.as("u-outro-operador");
    expect(await a.approve({ id: "ap-1" })).toEqual({ ok: false, error: "forbidden" });
  });

  it("recusar exige motivo e segue as mesmas regras", async () => {
    const m = memoryPort();
    const a = createApprovalsWith(m.port);
    await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:a=b",
      justification: "j",
    });
    m.as(MARINA);
    expect(await a.reject({ id: "ap-1", reason: " " })).toEqual({ ok: false, error: "invalid" });
    expect(await a.reject({ id: "ap-1", reason: "Sem acordo" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(m.rows.get("ap-1")?.status).toBe("rejected");
  });

  it("pendentes por prefixo do alvo", async () => {
    const m = memoryPort();
    const a = createApprovalsWith(m.port);
    await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s1:a=b",
      justification: "j",
    });
    await a.requestApproval({
      kind: "source.critical",
      targetRef: "source:s2:a=b",
      justification: "j",
    });
    expect((await a.pending("source:s1:")).map((r) => r.id)).toEqual(["ap-1"]);
    expect(await a.pending("source:")).toHaveLength(2);
  });

  it("tipos de mudança crítica incluem source.critical", () => {
    expect(CRITICAL_KINDS).toContain("source.critical");
    expect(CRITICAL_KINDS).toContain("role.admin");
  });
});
