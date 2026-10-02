import "server-only";
import { parseHomeLayout, type HomeModule } from "@/lib/admin/home-layout";
import { suggestTagMerges, type MergeSuggestion, type TagUsage } from "@/lib/admin/taxonomy";
import { isRole } from "@/lib/admin/roles";
import { adminRevokeTarget, userTarget } from "@/lib/approvals/targets";
import { invitePending } from "@/lib/admin/invites";
import type { RoleGrant } from "@/lib/auth/permissions";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { studioContext } from "@/lib/studio/context";
import { pendingApprovalsFor, type ApprovalItem } from "./approvals";

/*
 * Leituras da Administração (A01–A06, P5-T8) com a sessão da pessoa (RLS valendo). A única
 * exceção é o Auth: e-mail e último acesso da equipe só existem em `auth.users`, lidos com o
 * service role dentro de `listStaff` (rota já guardada por `users.manage`); nada disso vai para
 * o cliente além do que a tela mostra.
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`admin ${what}: ${error.message}`);
}

async function names(db: DbClient, ids: (string | null | undefined)[]) {
  const uuids = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (uuids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from("profiles").select("id, display_name").in("id", uuids);
  check("profiles", error);
  return new Map((data ?? []).map((r) => [r.id, r.display_name]));
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------
export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  roles: RoleGrant[];
  /** Convite enviado e ainda sem primeiro acesso. */
  pendingInvite: boolean;
  lastSignInAt: string | null;
  /** Pedido `role.admin` aberto ou já aprovado (falta aplicar). */
  adminApproval: { id: string; status: "pending" | "approved"; requestedBy: string } | null;
  /** Pedido `role.admin` de revogação (alvo `revoke:<uuid>`), aberto ou aprovado. */
  adminRevokeApproval: { id: string; status: "pending" | "approved"; requestedBy: string } | null;
}

export async function listStaff(): Promise<StaffMember[]> {
  const { db } = await studioContext();
  const [people, invites, approvals] = await Promise.all([
    db.rpc("studio_people"),
    db.from("staff_invites").select("user_id, email, accepted_at, revoked_at, expires_at"),
    db
      .from("approvals")
      .select("id, target_ref, status, requested_by")
      .eq("kind", "role.admin")
      .in("status", ["pending", "approved"]),
  ]);
  check("people", people.error);
  check("invites", invites.error);
  check("approvals", approvals.error);

  const rolesOf = new Map<string, RoleGrant[]>();
  const { data: roleRows, error: roleErr } = await db
    .from("user_roles")
    .select("user_id, role, sections");
  check("roles", roleErr);
  for (const r of roleRows ?? []) {
    if (!isRole(r.role)) continue;
    rolesOf.set(r.user_id, [
      ...(rolesOf.get(r.user_id) ?? []),
      { role: r.role, sections: r.sections },
    ]);
  }

  const auth = new Map<string, { email: string | null; lastSignInAt: string | null }>();
  try {
    const svc = createServiceClient();
    const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
    for (const u of data?.users ?? [])
      auth.set(u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null });
  } catch {
    // Sem service role (ex.: ambiente restrito) a lista vem sem e-mail nem último acesso.
  }

  const invited = new Map((invites.data ?? []).map((i) => [i.user_id, i]));
  const approval = new Map(
    (approvals.data ?? []).map((a) => [
      a.target_ref,
      { id: a.id, status: a.status as "pending" | "approved", requestedBy: a.requested_by },
    ]),
  );
  return (people.data ?? []).map((p) => {
    const a = auth.get(p.id);
    const inv = invited.get(p.id);
    return {
      id: p.id,
      name: p.name,
      email: a?.email ?? inv?.email ?? null,
      roles: rolesOf.get(p.id) ?? [],
      pendingInvite: Boolean(inv && invitePending(inv) && !a?.lastSignInAt),
      lastSignInAt: a?.lastSignInAt ?? null,
      adminApproval: approval.get(userTarget(p.id)) ?? null,
      adminRevokeApproval: approval.get(adminRevokeTarget(p.id)) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------------------
export interface TeamView {
  id: string;
  slug: string;
  name: string;
  description: string;
  sections: string[];
  lead: { id: string; name: string } | null;
  members: { id: string; name: string }[];
}

export async function listTeams(): Promise<TeamView[]> {
  const { db } = await studioContext();
  const [teams, members] = await Promise.all([
    db.from("teams").select("id, slug, name, description, sections, lead_id").order("name"),
    db.from("team_members").select("team_id, user_id").order("added_at"),
  ]);
  check("teams", teams.error);
  check("team_members", members.error);
  const people = await names(db, [
    ...(teams.data ?? []).map((t) => t.lead_id),
    ...(members.data ?? []).map((m) => m.user_id),
  ]);
  const who = (id: string) => ({ id, name: people.get(id) ?? "—" });
  return (teams.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    sections: t.sections,
    lead: t.lead_id ? who(t.lead_id) : null,
    members: (members.data ?? []).filter((m) => m.team_id === t.id).map((m) => who(m.user_id)),
  }));
}

// ---------------------------------------------------------------------------
// Taxonomia
// ---------------------------------------------------------------------------
export interface SectionRow {
  slug: string;
  name: string;
  parentSlug: string | null;
  autonomyCategory: string;
}
export interface PlaceRow {
  slug: string;
  name: string;
  kind: "bairro" | "municipio";
  inPhrase: string;
  active: boolean;
}
export interface TaxonomyOverview {
  sections: SectionRow[];
  tags: TagUsage[];
  suggestions: MergeSuggestion[];
  places: PlaceRow[];
}

export async function taxonomyOverview(db?: DbClient): Promise<TaxonomyOverview> {
  const client = db ?? (await studioContext()).db;
  const [sections, tags, places] = await Promise.all([
    client.from("sections").select("slug, name, parent_slug, autonomy_category").order("name"),
    client.rpc("taxonomy_tags"),
    client.from("places").select("slug, name, kind, in_phrase, active").order("name"),
  ]);
  check("sections", sections.error);
  check("tags", tags.error);
  check("places", places.error);
  const usage: TagUsage[] = (tags.data ?? []).map((t) => ({
    tag: t.tag,
    articles: t.articles,
    items: t.items,
  }));
  return {
    sections: (sections.data ?? []).map((s) => ({
      slug: s.slug,
      name: s.name,
      parentSlug: s.parent_slug,
      autonomyCategory: s.autonomy_category,
    })),
    tags: usage,
    suggestions: suggestTagMerges(usage),
    places: (places.data ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      kind: p.kind === "municipio" ? "municipio" : "bairro",
      inPhrase: p.in_phrase,
      active: p.active,
    })),
  };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export interface HomeLayoutRow {
  id: string;
  version: number;
  modules: HomeModule[];
  status: "draft" | "published" | "archived";
  note: string;
  createdBy: string | null;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
}
export interface HomeLayoutsView {
  published: HomeLayoutRow | null;
  draft: HomeLayoutRow | null;
  history: HomeLayoutRow[];
}

export async function homeLayouts(db?: DbClient): Promise<HomeLayoutsView> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("home_layouts")
    .select(
      "id, version, modules, status, note, created_by, created_at, published_by, published_at",
    )
    .order("version", { ascending: false })
    .limit(30);
  check("home_layouts", error);
  const people = await names(
    client,
    (data ?? []).flatMap((r) => [r.created_by, r.published_by]),
  );
  const rows: HomeLayoutRow[] = (data ?? []).map((r) => ({
    id: r.id,
    version: r.version,
    modules: parseHomeLayout(r.modules),
    status: r.status as HomeLayoutRow["status"],
    note: r.note,
    createdBy: r.created_by ? (people.get(r.created_by) ?? null) : null,
    createdAt: r.created_at,
    publishedBy: r.published_by ? (people.get(r.published_by) ?? null) : null,
    publishedAt: r.published_at,
  }));
  return {
    published: rows.find((r) => r.status === "published") ?? null,
    draft: rows.find((r) => r.status === "draft") ?? null,
    history: rows,
  };
}

// ---------------------------------------------------------------------------
// Painel (A01)
// ---------------------------------------------------------------------------
export interface AdminOverview {
  staff: number;
  pendingInvites: number;
  pendingApprovals: number;
  teams: number;
  homeVersion: number | null;
  tagSuggestions: number;
  adminRequests: ApprovalItem[];
}

export async function adminOverview(): Promise<AdminOverview> {
  const { db } = await studioContext();
  const [people, invites, approvals, teams, home, tags] = await Promise.all([
    db.rpc("studio_people"),
    db.from("staff_invites").select("accepted_at, revoked_at, expires_at"),
    db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("teams").select("id", { count: "exact", head: true }),
    db.from("home_layouts").select("version").eq("status", "published").maybeSingle(),
    db.rpc("taxonomy_tags"),
  ]);
  check("people", people.error);
  check("invites", invites.error);
  check("approvals", approvals.error);
  check("teams", teams.error);
  check("home", home.error);
  check("tags", tags.error);
  const adminRequests = (await pendingApprovalsFor("", db)).filter((a) => a.kind === "role.admin");
  return {
    staff: (people.data ?? []).length,
    pendingInvites: (invites.data ?? []).filter((i) => invitePending(i)).length,
    pendingApprovals: approvals.count ?? 0,
    teams: teams.count ?? 0,
    homeVersion: home.data?.version ?? null,
    tagSuggestions: suggestTagMerges(
      (tags.data ?? []).map((t) => ({ tag: t.tag, articles: t.articles, items: t.items })),
    ).length,
    adminRequests,
  };
}
