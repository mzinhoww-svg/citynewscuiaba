// @vitest-environment node
// P5-T8 · Administração: usuários, convites, papéis (admin só com aprovação de outra pessoa),
// equipes, taxonomia (mesclagem preserva vínculos) e home (rascunho e publicação).
// As funções de domínio rodam como usuários de seed (JWT real, RLS e triggers valendo).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addTeamMember, deleteTeam, removeTeamMember, saveTeam } from "@/lib/admin/teams";
import { createTag, deleteTag, mergeTags, renameSection } from "@/lib/admin/taxonomy";
import { getHomeEditorState, publishHome, saveHomeDraft } from "@/lib/admin/home";
import {
  grantRole,
  inviteUser,
  revokeInvite,
  revokeRole,
  setRoleSections,
} from "@/lib/admin/users";
import { approve, reject } from "@/lib/approvals";
import { DEFAULT_HOME_MODULES, moveModule } from "@/lib/home/modules";
import { asUser, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const HELENA = SEED_USERS.helena.id;
let tempId = "";
const tempEmail = `admin-core-${run}@citynews.local`;
const invitedEmail = `convidado-${run}@exemplo.test`;
const teamIds: string[] = [];
const tagIds: string[] = [];
const articleIds: string[] = [];
let sectionName = "";
const startedAt = new Date().toISOString();
let wasPublished: string[] = [];

beforeAll(async () => {
  const u = await service.auth.admin.createUser({
    email: tempEmail,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (u.error) throw u.error;
  tempId = u.data.user.id;
  const p = await service
    .from("profiles")
    .insert({ id: tempId, display_name: `Pessoa Teste ${run}` });
  if (p.error) throw p.error;
  wasPublished = (
    (await service.from("home_layouts").select("id").eq("status", "published")).data ?? []
  ).map((r) => r.id);
  const s = await service.from("sections").select("name").eq("slug", "clima").single();
  sectionName = s.data?.name ?? "Clima";
});

afterAll(async () => {
  await service.from("approvals").delete().eq("kind", "role.admin").eq("target_ref", tempId);
  await service.from("user_roles").delete().eq("user_id", tempId);
  await service.from("team_members").delete().eq("user_id", tempId);
  if (teamIds.length) await service.from("teams").delete().in("id", teamIds);
  await service.from("staff_invites").delete().eq("email", invitedEmail);
  if (articleIds.length) await service.from("article_tags").delete().in("article_id", articleIds);
  if (tagIds.length) await service.from("tags").delete().in("id", tagIds);
  await service.from("home_layouts").delete().gte("created_at", startedAt);
  if (wasPublished.length)
    await service.from("home_layouts").update({ status: "published" }).in("id", wasPublished);
  await service.from("sections").update({ name: sectionName }).eq("slug", "clima");
  await service.from("profiles").delete().eq("id", tempId);
  await service.auth.admin.deleteUser(tempId);
});

describe("convites", () => {
  it("quem não é admin não convida", async () => {
    const r = await asUser("marina", () =>
      inviteUser({ email: invitedEmail, role: "jornalista", sections: [] }),
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("admin convida: fica pendente, com a mensagem na fila, e a auditoria registra", async () => {
    const r = await asUser("helena", () =>
      inviteUser({ email: invitedEmail.toUpperCase(), role: "jornalista", sections: [] }),
    );
    expect(r.ok).toBe(true);
    const row = await service.from("staff_invites").select("*").eq("email", invitedEmail).single();
    expect(row.data).toMatchObject({
      status: "pending",
      email_status: "queued",
      role: "jornalista",
    });
    expect(row.data?.email_body).toContain("/entrar?convite=");
    expect(row.data?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const log = await service
      .from("audit_log")
      .select("actor, action")
      .eq("action", "user.invite")
      .eq("object_ref", `invite:${invitedEmail}`);
    expect(log.data?.[0]).toMatchObject({ actor: HELENA });
  });

  it("repetido, e-mail inválido e convite para admin são recusados; cancelar funciona", async () => {
    const dup = await asUser("helena", () =>
      inviteUser({ email: invitedEmail, role: "editor", sections: [] }),
    );
    expect(dup).toMatchObject({ ok: false, error: "invalid" });
    const bad = await asUser("helena", () =>
      inviteUser({ email: "sem-arroba", role: "editor", sections: [] }),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const adm = await asUser("helena", () =>
      inviteUser({ email: `outro-${run}@exemplo.test`, role: "admin", sections: [] }),
    );
    expect(adm).toMatchObject({ ok: false, error: "invalid" });
    const already = await asUser("helena", () =>
      inviteUser({ email: SEED_USERS.marina.email, role: "editor", sections: [] }),
    );
    expect(already).toMatchObject({ ok: false, error: "invalid" });

    const row = await service.from("staff_invites").select("id").eq("email", invitedEmail).single();
    const out = await asUser("helena", () => revokeInvite({ id: row.data!.id }));
    expect(out.ok).toBe(true);
    const after = await service
      .from("staff_invites")
      .select("status")
      .eq("email", invitedEmail)
      .single();
    expect(after.data?.status).toBe("revoked");
  });
});

describe("papéis", () => {
  it("concede, ajusta editorias e revoga papel comum, com auditoria", async () => {
    const g = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "editor", sections: ["cidade"] }),
    );
    expect(g).toMatchObject({ ok: true, value: { outcome: "granted" } });
    const s = await asUser("helena", () =>
      setRoleSections({ userId: tempId, role: "editor", sections: ["cidade", "clima"] }),
    );
    expect(s.ok).toBe(true);
    const row = await service
      .from("user_roles")
      .select("sections")
      .eq("user_id", tempId)
      .eq("role", "editor")
      .single();
    expect(row.data?.sections).toEqual(["cidade", "clima"]);
    const bad = await asUser("helena", () =>
      setRoleSections({ userId: tempId, role: "editor", sections: ["nao-existe"] }),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const r = await asUser("helena", () => revokeRole({ userId: tempId, role: "editor" }));
    expect(r.ok).toBe(true);
    const log = await service.from("audit_log").select("action").eq("object_ref", `user:${tempId}`);
    expect(log.data?.map((l) => l.action)).toEqual(
      expect.arrayContaining(["role.grant", "role.sections", "role.revoke"]),
    );
  });

  it("ninguém altera o próprio papel", async () => {
    const r = await asUser("helena", () =>
      grantRole({ userId: HELENA, role: "editor", sections: [] }),
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    expect(r.ok ? "" : r.message).toContain("próprio papel");
  });

  it("conceder admin: pede aprovação, espera outra pessoa e só então concede", async () => {
    const noWhy = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "admin", sections: [] }),
    );
    expect(noWhy).toMatchObject({ ok: false, error: "invalid" });

    const req = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "admin", sections: [], justification: "Novo chefe de TI" }),
    );
    expect(req).toMatchObject({ ok: true, value: { outcome: "requested" } });
    const none = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", tempId)
      .eq("role", "admin");
    expect(none.data).toEqual([]);

    const again = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "admin", sections: [], justification: "de novo" }),
    );
    expect(again).toMatchObject({ ok: true, value: { outcome: "waiting" } });

    const pend = await service
      .from("approvals")
      .select("id")
      .eq("kind", "role.admin")
      .eq("target_ref", tempId)
      .eq("status", "pending")
      .single();
    const self = await asUser("helena", () => approve({ id: pend.data!.id }));
    expect(self).toMatchObject({
      ok: false,
      error: "self_approval",
      message: "A aprovação precisa ser de outra pessoa",
    });

    const ok = await asUser("marina", () => approve({ id: pend.data!.id }));
    expect(ok.ok).toBe(true);

    const granted = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "admin", sections: [] }),
    );
    expect(granted).toMatchObject({ ok: true, value: { outcome: "granted" } });
    const now = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", tempId)
      .eq("role", "admin");
    expect(now.data).toHaveLength(1);
    const used = await service.from("approvals").select("status").eq("id", pend.data!.id).single();
    expect(used.data?.status).toBe("applied");

    // A aprovação é de uso único: revogar e conceder de novo pede outra.
    const rev = await asUser("helena", () => revokeRole({ userId: tempId, role: "admin" }));
    expect(rev.ok).toBe(true);
    const next = await asUser("helena", () =>
      grantRole({ userId: tempId, role: "admin", sections: [], justification: "segunda vez" }),
    );
    expect(next).toMatchObject({ ok: true, value: { outcome: "requested" } });
    const p2 = await service
      .from("approvals")
      .select("id")
      .eq("kind", "role.admin")
      .eq("target_ref", tempId)
      .eq("status", "pending")
      .single();
    const rej = await asUser("marina", () => reject({ id: p2.data!.id }));
    expect(rej.ok).toBe(true);
  });

  it("o banco recusa admin sem aprovação mesmo por chamada direta", async () => {
    const { clientOf } = await import("./studio");
    const db = await clientOf("helena");
    const r = await db.from("user_roles").insert({ user_id: tempId, role: "admin", sections: [] });
    expect(r.error?.message).toContain("aprovação role.admin");
  });
});

describe("equipes", () => {
  it("cria, edita, adiciona e remove integrantes, recusa nome repetido e exclui", async () => {
    const name = `Equipe Teste ${run}`;
    const c = await asUser("helena", () => saveTeam({ name, description: "Plantão" }));
    expect(c.ok).toBe(true);
    const id = c.ok ? c.value.id : "";
    teamIds.push(id);
    const dup = await asUser("helena", () => saveTeam({ name: name.toLowerCase() }));
    expect(dup).toMatchObject({ ok: false, error: "invalid" });
    const upd = await asUser("helena", () => saveTeam({ id, name, leadId: SEED_USERS.marina.id }));
    expect(upd.ok).toBe(true);
    const add = await asUser("helena", () => addTeamMember({ teamId: id, userId: tempId }));
    expect(add.ok).toBe(true);
    const members = await service.from("team_members").select("user_id").eq("team_id", id);
    expect(members.data?.map((m) => m.user_id)).toEqual([tempId]);
    const denied = await asUser("marina", () => addTeamMember({ teamId: id, userId: HELENA }));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
    const rm = await asUser("helena", () => removeTeamMember({ teamId: id, userId: tempId }));
    expect(rm.ok).toBe(true);
    const del = await asUser("helena", () => deleteTeam({ id }));
    expect(del.ok).toBe(true);
  });
});

describe("taxonomia", () => {
  it("mesclar tags duplicadas preserva os vínculos, sem duplicar, e guarda o alias", async () => {
    const a = await asUser("helena", () => createTag({ name: `Obras Teste ${run}` }));
    const b = await asUser("helena", () => createTag({ name: `Obra Teste ${run}` }));
    expect(a.ok && b.ok).toBe(true);
    const from = a.ok ? a.value.id : "";
    const into = b.ok ? b.value.id : "";
    tagIds.push(from, into);
    const dupName = await asUser("helena", () => createTag({ name: `obras teste ${run}` }));
    expect(dupName).toMatchObject({ ok: false, error: "invalid" });

    const arts = (await service.from("articles").select("id").limit(3)).data ?? [];
    expect(arts.length).toBeGreaterThanOrEqual(3);
    articleIds.push(...arts.map((x) => x.id));
    const [a1, a2, a3] = arts.map((x) => x.id) as [string, string, string];
    await service.from("article_tags").insert([
      { article_id: a1, tag_id: from },
      { article_id: a2, tag_id: from },
      { article_id: a2, tag_id: into },
      { article_id: a3, tag_id: into },
    ]);
    const blocked = await asUser("helena", () => deleteTag({ id: from }));
    expect(blocked).toMatchObject({ ok: false, error: "invalid" });

    const m = await asUser("helena", () => mergeTags({ fromId: from, intoId: into }));
    expect(m.ok).toBe(true);
    const links = await service.from("article_tags").select("article_id").eq("tag_id", into);
    expect(new Set(links.data?.map((l) => l.article_id))).toEqual(new Set([a1, a2, a3]));
    expect(links.data).toHaveLength(3);
    expect((await service.from("tags").select("id").eq("id", from)).data).toEqual([]);
    const alias = await service.from("tag_aliases").select("tag_id").eq("tag_id", into);
    expect(alias.data).toHaveLength(1);
    const same = await asUser("helena", () => mergeTags({ fromId: into, intoId: into }));
    expect(same).toMatchObject({ ok: false, error: "invalid" });
  });

  it("renomeia editoria com auditoria e recusa quem não é admin", async () => {
    const r = await asUser("helena", () => renameSection({ slug: "clima", name: "Clima e tempo" }));
    expect(r.ok).toBe(true);
    const denied = await asUser("marina", () => renameSection({ slug: "clima", name: "Outro" }));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
  });
});

describe("home", () => {
  it("rascunho não muda a publicada; publicar cria versão e a home pública a lê", async () => {
    const before = await getHomeEditorStateAs();
    const reordered = moveModule([...DEFAULT_HOME_MODULES], 1, -1).map((m) =>
      m.key === "nearby" ? { ...m, enabled: false } : m,
    );
    const d = await asUser("helena", () => saveHomeDraft({ modules: reordered }));
    expect(d.ok).toBe(true);
    const state = await getHomeEditorStateAs();
    expect(state.source).toBe("draft");
    expect(state.modules.map((m) => m.key)).toEqual(reordered.map((m) => m.key));
    const pub1 = await service.from("home_layouts").select("id").eq("status", "published");
    expect(pub1.data?.length ?? 0).toBe(before.publishedVersion === null ? 0 : 1);

    const tags: string[][] = [];
    const p = await asUser("helena", () => publishHome({ modules: reordered }), {
      revalidate: async (t) => {
        tags.push(t);
      },
    });
    expect(p.ok).toBe(true);
    expect(tags.flat()).toContain("home");
    const live = await service
      .from("home_layouts")
      .select("status, modules")
      .eq("status", "published");
    expect(live.data).toHaveLength(1);
    const drafts = await service.from("home_layouts").select("id").eq("status", "draft");
    expect(drafts.data).toEqual([]);

    const { getPublishedHomeModules } = await import("@/lib/db/queries/home-layout");
    const served = await getPublishedHomeModules();
    expect(served.map((m) => m.key)).toEqual(reordered.map((m) => m.key));
    expect(served.find((m) => m.key === "nearby")?.enabled).toBe(false);

    const denied = await asUser("marina", () => publishHome({ modules: reordered }));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
    const badKeys = await asUser("helena", () =>
      publishHome({ modules: [{ key: "topics", enabled: true }] as never }),
    );
    expect(badKeys).toMatchObject({ ok: false, error: "invalid" });
  });
});

function getHomeEditorStateAs() {
  return asUser("helena", () => getHomeEditorState());
}
