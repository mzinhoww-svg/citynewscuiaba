// @vitest-environment node
// P5-T8 · Administração (A02–A06): convite cria conta, papel e "Convite pendente"; conceder
// admin abre pedido `role.admin` e só aplica depois de outra pessoa aprovar; mesclar tags
// duplicadas preserva vínculos; rascunho da home publica com uma só versão publicada.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { defaultHomeLayout, moveModule } from "@/lib/admin/home-layout";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { homeLayouts, listStaff, taxonomyOverview } from "@/lib/db/queries/admin";
import { fetchPublishedHomeLayout } from "@/lib/db/queries/home";
import { publishHomeCommand, saveHomeDraftCommand } from "@/lib/studio/admin-home";
import { mergeTagsCommand } from "@/lib/studio/admin-taxonomy";
import {
  applyAdminRoleCommand,
  inviteUserCommand,
  setRolesCommand,
} from "@/lib/studio/admin-users";
import { hasMailbox, lastLinkFor } from "../e2e/mailbox";
import { asUser, SEED_USERS, service } from "./studio";

const mark = randomUUID().slice(0, 8);
const invitedIds: string[] = [];
const articleIds: string[] = [];

afterAll(async () => {
  for (const id of invitedIds) {
    await service.from("user_roles").delete().eq("user_id", id);
    await service.from("profiles").delete().eq("id", id);
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await service.from("user_roles").delete().eq("user_id", SEED_USERS.thiago.id).eq("role", "admin");
  await service
    .from("approvals")
    .delete()
    .eq("kind", "role.admin")
    .eq("target_ref", SEED_USERS.thiago.id);
  if (articleIds.length) await service.from("articles").delete().in("id", articleIds);
  // Home: a v1 do seed volta a ser a única publicada.
  await service.from("home_layouts").delete().gt("version", 1);
  await service.from("home_layouts").update({ status: "published" }).eq("version", 1);
});

describe("administração (banco real)", () => {
  it("as ações de auditoria da administração estão nas duas listas", async () => {
    const r = await service.rpc("studio_audit_actions");
    expect(r.error).toBeNull();
    for (const a of [
      "user.invite",
      "user.role.grant",
      "taxonomy.merge",
      "home.publish",
      "site.manage",
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
      expect(r.data).toContain(a);
    }
  });

  it(
    "convidar cria conta, perfil e papel, manda o link e aparece como convite pendente",
    { timeout: 30_000 },
    async () => {
      const email = `convite-${mark}@exemplo.com`;
      const r = await asUser("helena", () =>
        inviteUserCommand({ name: `Pessoa ${mark}`, email, role: "editor", sections: ["cidade"] }),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      invitedIds.push(r.value.userId);
      const staff = await asUser("helena", () => listStaff());
      const me = staff.find((s) => s.id === r.value.userId);
      expect(me).toMatchObject({
        pendingInvite: true,
        email,
        roles: [{ role: "editor", sections: ["cidade"] }],
      });
      if (hasMailbox()) expect(await lastLinkFor(email)).toMatch(/verify/);
      const audit = await service
        .from("audit_log")
        .select("actor")
        .eq("action", "user.invite")
        .eq("object_ref", `user:${r.value.userId}`);
      expect(audit.data).toHaveLength(1);

      const dup = await asUser("helena", () =>
        inviteUserCommand({ name: "Outra", email, role: "jornalista", sections: [] }),
      );
      expect(dup.ok).toBe(false);
      const admin = await asUser("helena", () =>
        inviteUserCommand({
          name: "Outra",
          email: `admin-${mark}@exemplo.com`,
          role: "admin",
          sections: [],
        }),
      );
      expect(admin).toMatchObject({ ok: false, error: "invalid" });
    },
  );

  it("editora-chefe não convida; ninguém muda os próprios papéis", async () => {
    const r = await asUser("marina", () =>
      inviteUserCommand({
        name: "Xis",
        email: `x-${mark}@exemplo.com`,
        role: "jornalista",
        sections: [],
      }),
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    const self = await asUser("helena", () =>
      setRolesCommand({ userId: SEED_USERS.helena.id, roles: [{ role: "admin", sections: [] }] }),
    );
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("conceder admin abre pedido role.admin; só aplica depois de outra pessoa aprovar", async () => {
    const thiago = SEED_USERS.thiago.id;
    const noJust = await asUser("helena", () =>
      setRolesCommand({
        userId: thiago,
        roles: [
          { role: "analista", sections: [] },
          { role: "admin", sections: [] },
        ],
      }),
    );
    expect(noJust).toMatchObject({ ok: false, error: "invalid" });

    const r = await asUser("helena", () =>
      setRolesCommand({
        userId: thiago,
        roles: [
          { role: "analista", sections: [] },
          { role: "admin", sections: [] },
        ],
        justification: "Cobrir férias da administração",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.adminApprovalId).toBeTruthy();
    expect(r.value.granted).toEqual([]);
    const roles = await service.from("user_roles").select("role").eq("user_id", thiago);
    expect(roles.data?.map((x) => x.role)).toEqual(["analista"]);
    const staff = await asUser("helena", () => listStaff());
    expect(staff.find((s) => s.id === thiago)?.adminApproval).toMatchObject({ status: "pending" });

    // Sem aprovação decidida, aplicar é recusado pelo banco.
    const early = await asUser("helena", () => applyAdminRoleCommand({ userId: thiago }));
    expect(early).toMatchObject({ ok: false, error: "conflict" });

    // Outra pessoa aprova (aqui o pedido é decidido em nome de Marina pelo seed do teste).
    await service
      .from("approvals")
      .update({
        status: "approved",
        approved_by: SEED_USERS.marina.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", r.value.adminApprovalId!);
    // Quem pediu foi Helena e quem aprovou Marina; Helena aplica e o trigger consome o pedido.
    const applied = await asUser("helena", () => applyAdminRoleCommand({ userId: thiago }));
    expect(applied.ok).toBe(true);
    const after = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", thiago)
      .order("role");
    expect(after.data?.map((x) => x.role)).toEqual(["admin", "analista"]);
    const consumed = await service
      .from("approvals")
      .select("status")
      .eq("id", r.value.adminApprovalId!)
      .single();
    expect(consumed.data?.status).toBe("applied");

    // Revogar volta ao estado do seed.
    const revoke = await asUser("helena", () =>
      setRolesCommand({ userId: thiago, roles: [{ role: "analista", sections: [] }] }),
    );
    expect(revoke.ok && revoke.value.revoked).toEqual(["admin"]);
  });

  it("mesclar tags duplicadas preserva os vínculos e não duplica", async () => {
    const mk = async (tags: string[]) => {
      const id = randomUUID();
      articleIds.push(id);
      const r = await service.from("articles").insert({
        id,
        slug: `tag-${id.slice(0, 8)}`,
        kind: "original",
        section_slug: "cidade",
        title: "Tag",
        dek: "Linha",
        body: { type: "doc", content: [] },
        status: "draft",
        tags,
      });
      if (r.error) throw r.error;
      return id;
    };
    const a = await mk([`onibus-${mark}`]);
    const b = await mk([`ônibus-${mark}`, `onibus-${mark}`, "clima"]);
    const before = await asUser("marina", () => taxonomyOverview());
    // A sugestão aponta para a mais usada; a decisão (aqui, ficar com a acentuada) é humana.
    expect(before.suggestions.find((s) => s.into === `onibus-${mark}`)).toMatchObject({
      from: [`ônibus-${mark}`],
      reason: "accent",
    });

    const r = await asUser("marina", () =>
      mergeTagsCommand({ from: `onibus-${mark}`, into: `ônibus-${mark}` }),
    );
    expect(r).toMatchObject({ ok: true, value: { links: 2 } });
    const rows = await service.from("articles").select("id, tags").in("id", [a, b]);
    expect(rows.data?.find((x) => x.id === a)?.tags).toEqual([`ônibus-${mark}`]);
    expect(rows.data?.find((x) => x.id === b)?.tags).toEqual(["clima", `ônibus-${mark}`]);

    const denied = await asUser("diego", () => mergeTagsCommand({ from: "a", into: "b" }));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("rascunho da home é versionado e publicar deixa uma só versão publicada", async () => {
    const same = await asUser("marina", () =>
      saveHomeDraftCommand({ modules: defaultHomeLayout(), note: "" }),
    );
    expect(same).toMatchObject({ ok: false, error: "conflict" });

    const moved = moveModule(defaultHomeLayout(), "newsletter", "up");
    const saved = await asUser("marina", () =>
      saveHomeDraftCommand({ modules: moved, note: "Newsletter antes do panorama" }),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const view = await asUser("marina", () => homeLayouts());
    expect(view.draft?.version).toBe(saved.value.version);
    expect(view.published?.version).toBe(1);

    const published = await asUser("marina", () => publishHomeCommand({ id: saved.value.id }));
    expect(published).toMatchObject({ ok: true, value: { version: saved.value.version } });
    const after = await asUser("marina", () => homeLayouts());
    expect(after.published?.version).toBe(saved.value.version);
    expect(after.history.filter((h) => h.status === "published")).toHaveLength(1);
    expect(after.history.find((h) => h.version === 1)?.status).toBe("archived");

    const portal = await fetchPublishedHomeLayout(service);
    expect(portal.map((m) => m.id).slice(-2)).toEqual(["newsletter", "panorama"]);

    const denied = await asUser("diego", () => saveHomeDraftCommand({ modules: moved, note: "" }));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
  });
});
