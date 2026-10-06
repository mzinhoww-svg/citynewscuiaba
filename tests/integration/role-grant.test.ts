// @vitest-environment node
// UX-W3-T7 · item 61 (A-150; regra do dono A-128): quem tem `users.manage` concede ou revoga papel
// numa ação só. O banco (`role_set`, 0158) registra o pedido em `approvals` com quem pediu e quem
// aprovou (a mesma pessoa), aplica e audita na mesma transação. Sem `users.manage`, nada muda.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setRolesCommand } from "@/lib/studio/admin-users";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const carlos = SEED_USERS.carlos.id;
const helena = SEED_USERS.helena.id;
const startedAt = new Date().toISOString();

async function rolesOf(userId: string) {
  const r = await service
    .from("user_roles")
    .select("role, sections")
    .eq("user_id", userId)
    .order("role");
  if (r.error) throw r.error;
  return r.data;
}

async function restoreCarlos() {
  await service.from("user_roles").delete().eq("user_id", carlos).neq("role", "moderador");
  await service
    .from("user_roles")
    .upsert({ user_id: carlos, role: "moderador", sections: [] }, { onConflict: "user_id,role" });
}

beforeAll(restoreCarlos);

afterAll(async () => {
  await restoreCarlos();
  await service
    .from("approvals")
    .delete()
    .in("kind", ["role.grant", "role.revoke"])
    .like("target_ref", `user:${carlos}:%`);
});

describe("papel numa ação só (role_set, banco real)", () => {
  it("admin concede editor numa chamada: approvals com requested_by = approved_by e auditoria", async () => {
    const r = await asUser("helena", () =>
      setRolesCommand({
        userId: carlos,
        roles: [
          { role: "moderador", sections: [] },
          { role: "editor", sections: ["cidade"] },
        ],
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { granted: ["editor"], revoked: [] } });
    if (!r.ok) return;
    expect(await rolesOf(carlos)).toEqual([
      { role: "editor", sections: ["cidade"] },
      { role: "moderador", sections: [] },
    ]);
    expect(r.value.approvalIds).toHaveLength(1);
    const row = await service
      .from("approvals")
      .select("kind, target_ref, status, requested_by, approved_by, decided_at")
      .eq("id", r.value.approvalIds[0]!)
      .single();
    expect(row.data).toMatchObject({
      kind: "role.grant",
      target_ref: `user:${carlos}:editor`,
      status: "applied",
      requested_by: helena,
      approved_by: helena,
    });
    expect(row.data?.decided_at).toBeTruthy();
    const audit = await service
      .from("audit_log")
      .select("actor, action, object_ref, details")
      .eq("details->>approvalId", r.value.approvalIds[0]!);
    expect(audit.data).toEqual([
      expect.objectContaining({
        actor: helena,
        action: "user.role.grant",
        object_ref: `user:${carlos}`,
        details: expect.objectContaining({ role: "editor", sections: ["cidade"] }),
      }),
    ]);
  });

  it("revogar também é uma ação só, registrada como role.revoke", async () => {
    const r = await asUser("helena", () =>
      setRolesCommand({ userId: carlos, roles: [{ role: "moderador", sections: [] }] }),
    );
    expect(r).toMatchObject({ ok: true, value: { granted: [], revoked: ["editor"] } });
    if (!r.ok) return;
    expect(await rolesOf(carlos)).toEqual([{ role: "moderador", sections: [] }]);
    const row = await service
      .from("approvals")
      .select("kind, status, requested_by, approved_by")
      .eq("id", r.value.approvalIds[0]!)
      .single();
    expect(row.data).toEqual({
      kind: "role.revoke",
      status: "applied",
      requested_by: helena,
      approved_by: helena,
    });
  });

  it("admin: conceder e revogar administração exige justificativa e aplica na hora", async () => {
    const noJust = await asUser("helena", () =>
      setRolesCommand({
        userId: carlos,
        roles: [
          { role: "moderador", sections: [] },
          { role: "admin", sections: [] },
        ],
      }),
    );
    expect(noJust).toMatchObject({ ok: false, error: "invalid" });
    expect(await rolesOf(carlos)).toEqual([{ role: "moderador", sections: [] }]);

    const grant = await asUser("helena", () =>
      setRolesCommand({
        userId: carlos,
        roles: [
          { role: "moderador", sections: [] },
          { role: "admin", sections: [] },
        ],
        justification: "Cobrir férias da administração",
      }),
    );
    expect(grant).toMatchObject({ ok: true, value: { granted: ["admin"] } });
    expect((await rolesOf(carlos)).map((x) => x.role)).toEqual(["admin", "moderador"]);

    const revoke = await asUser("helena", () =>
      setRolesCommand({
        userId: carlos,
        roles: [{ role: "moderador", sections: [] }],
        justification: "Fim da cobertura",
      }),
    );
    expect(revoke).toMatchObject({ ok: true, value: { revoked: ["admin"] } });
    expect(await rolesOf(carlos)).toEqual([{ role: "moderador", sections: [] }]);
  });

  it("sem users.manage: erro e nada muda (pela ação e direto no banco)", async () => {
    const before = await service
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .like("target_ref", `user:${carlos}:%`)
      .gte("created_at", startedAt);
    const viaAction = await asUser("marina", () =>
      setRolesCommand({
        userId: carlos,
        roles: [
          { role: "moderador", sections: [] },
          { role: "editor", sections: ["cidade"] },
        ],
      }),
    );
    expect(viaAction).toMatchObject({ ok: false, error: "forbidden" });

    const marina = await clientOf("marina");
    const direct = await marina.rpc("role_set", {
      p_user: carlos,
      p_roles: [{ role: "editor", sections: ["cidade"] }],
      p_justification: "tentativa",
    });
    expect(direct.error?.code).toBe("42501");
    expect(await rolesOf(carlos)).toEqual([{ role: "moderador", sections: [] }]);
    const after = await service
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .like("target_ref", `user:${carlos}:%`)
      .gte("created_at", startedAt);
    expect(after.count).toBe(before.count);
  });

  it("ninguém mexe no próprio papel, nem direto no banco", async () => {
    const admin = await clientOf("helena");
    const self = await admin.rpc("role_set", {
      p_user: helena,
      p_roles: [],
      p_justification: "x",
    });
    expect(self.error?.code).toBe("42501");
    expect((await rolesOf(helena)).map((x) => x.role)).toEqual(["admin"]);
  });
});
