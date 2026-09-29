import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ROLES_TEXT as RT, USERS_TEXT as UT } from "@/content/pt-BR/admin";
import { requestApproval, normalizeJustification } from "@/lib/approvals";
import { ROLES, type Role } from "@/lib/auth/permissions";
import { siteUrl } from "@/lib/seo/jsonld";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { studioContext } from "@/lib/studio/context";

/*
 * Usuários, convites e papéis (A02, A03). Toda mutação passa por `studioAction("users.manage")`
 * (só admin, Server Action chamada direto não escapa) e é auditada. Conceder `admin` nunca
 * acontece direto: pede a aprovação `role.admin` (outra pessoa decide) e só se consuma quando o
 * banco encontra a aprovação (guard_user_roles / consume_role_admin_approval, migration 0002).
 */

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  roles: { role: Role; sections: string[] }[];
}

export interface InviteRow {
  id: string;
  email: string;
  role: Role;
  sections: string[];
  createdAt: string;
  status: "pending";
}

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

function parseRoles(raw: unknown): UserRow["roles"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = r as { role?: unknown; sections?: unknown };
    return typeof o.role === "string" && isRole(o.role)
      ? [{ role: o.role, sections: Array.isArray(o.sections) ? o.sections.map(String) : [] }]
      : [];
  });
}

/** Pessoas com acesso e convites pendentes (só admin: a função do banco devolve vazio a outros). */
export async function listUsers(): Promise<{ people: UserRow[]; invites: InviteRow[] }> {
  const { db } = await studioContext();
  const [dir, inv] = await Promise.all([
    db.rpc("admin_user_directory"),
    db
      .from("staff_invites")
      .select("id, email, role, sections, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (dir.error) throw new Error(`usuários: ${dir.error.message}`);
  if (inv.error) throw new Error(`convites: ${inv.error.message}`);
  const people = (dir.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    createdAt: p.created_at,
    lastSignInAt: p.last_sign_in_at,
    roles: parseRoles(p.roles),
  }));
  const invites = (inv.data ?? []).flatMap((i) =>
    isRole(i.role)
      ? [
          {
            id: i.id,
            email: i.email,
            role: i.role,
            sections: i.sections,
            createdAt: i.created_at,
            status: "pending" as const,
          },
        ]
      : [],
  );
  return { people, invites };
}

/** Só quem já tem papel (equipe): quem aparece em Papéis. */
export const staffOnly = (people: UserRow[]) => people.filter((p) => p.roles.length > 0);

const SectionsInput = z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(30);

/** "cidade, servicos" → ["cidade", "servicos"] (sem repetição, sem vazios). */
export function parseSections(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

async function knownSections(): Promise<Set<string>> {
  const { db } = await studioContext();
  const { data, error } = await db.from("sections").select("slug");
  if (error) throw new Error(`editorias: ${error.message}`);
  return new Set((data ?? []).map((s) => s.slug));
}

async function assertSections(sections: string[]): Promise<void> {
  const known = await knownSections();
  if (sections.some((s) => !known.has(s))) {
    throw new StudioFailure("invalid", RT.errors.unknownSection);
  }
}

const roleEnum = z.enum(ROLES as unknown as [Role, ...Role[]]);

export const inviteUser = studioAction(
  "users.manage",
  () => ({}),
  async (input: { email: string; role: Role; sections: string[] }, ctx) => {
    if (input.role === "admin") throw new StudioFailure("invalid", UT.errors.role);
    await assertSections(input.sections);
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const link = `${siteUrl()}/entrar?${new URLSearchParams({ convite: token })}`;
    const { data, error } = await ctx.db.rpc("admin_invite_user", {
      p_email: input.email,
      p_role: input.role,
      p_sections: input.sections,
      p_token_hash: tokenHash,
      p_subject: UT.mailSubject,
      p_body: UT.mailBody(link),
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("já tem acesso")) {
        throw new StudioFailure("invalid", UT.errors.already);
      }
      if (error.code === "23505") throw new StudioFailure("invalid", UT.errors.duplicate);
      if (error.code === "22023") throw new StudioFailure("invalid", UT.errors.email);
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`convite: ${error.message}`);
    }
    ctx.detail({ email: input.email, role: input.role, sections: input.sections });
    return { id: data };
  },
  {
    schema: z.object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .max(254)
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, UT.errors.email),
      role: roleEnum,
      sections: SectionsInput,
    }),
    objectRef: (i) => `invite:${i.email}`,
    auditAs: "user.invite",
  },
);

export const revokeInvite = studioAction(
  "users.manage",
  () => ({}),
  async (input: { id: string }, ctx) => {
    const { data, error } = await ctx.db.rpc("admin_revoke_invite", { p_id: input.id });
    if (error) throw new Error(`convite: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    return { id: input.id };
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    objectRef: (i) => `invite:${i.id}`,
    auditAs: "user.invite_revoke",
  },
);

export type GrantOutcome = "granted" | "requested" | "waiting";

function mapRoleError(error: { code?: string; message: string }): never {
  if (error.message.includes("próprio papel")) throw new StudioFailure("forbidden", RT.errors.self);
  if (error.message.includes("último admin"))
    throw new StudioFailure("forbidden", RT.errors.lastAdmin);
  if (error.message.includes("aprovação role.admin"))
    throw new StudioFailure("forbidden", RT.errors.twoPerson);
  if (error.code === "42501") throw new StudioFailure("forbidden");
  throw new Error(`papéis: ${error.message}`);
}

export const grantRole = studioAction(
  "users.manage",
  () => ({}),
  async (
    input: { userId: string; role: Role; sections: string[]; justification?: string },
    ctx,
  ): Promise<{ outcome: GrantOutcome }> => {
    if (input.userId === ctx.userId) throw new StudioFailure("forbidden", RT.errors.self);
    await assertSections(input.sections);
    ctx.detail({ role: input.role, sections: input.sections });

    if (input.role === "admin") {
      // Só vale com pedido aprovado por OUTRA pessoa; o banco confere de novo ao gravar.
      const approved = await ctx.db
        .from("approvals")
        .select("id, requested_by, approved_by")
        .eq("kind", "role.admin")
        .eq("target_ref", input.userId)
        .eq("status", "approved");
      if (approved.error) throw new Error(`aprovações: ${approved.error.message}`);
      const usable = (approved.data ?? []).some(
        (a) => a.approved_by !== null && a.approved_by !== a.requested_by,
      );
      if (!usable) {
        const pending = await ctx.db
          .from("approvals")
          .select("id")
          .eq("kind", "role.admin")
          .eq("target_ref", input.userId)
          .eq("status", "pending")
          .limit(1);
        if (pending.error) throw new Error(`aprovações: ${pending.error.message}`);
        if ((pending.data ?? []).length > 0) {
          ctx.detail({ outcome: "waiting" });
          return { outcome: "waiting" };
        }
        if (normalizeJustification(input.justification ?? "") === null) {
          throw new StudioFailure("invalid", RT.errors.justification);
        }
        const req = await requestApproval({
          kind: "role.admin",
          targetRef: input.userId,
          justification: input.justification ?? "",
        });
        if (!req.ok) throw new StudioFailure("invalid", RT.errors.approval);
        ctx.detail({ outcome: "requested", approvalId: req.value.id });
        return { outcome: "requested" };
      }
    }

    const { error } = await ctx.db
      .from("user_roles")
      .upsert(
        { user_id: input.userId, role: input.role, sections: input.sections },
        { onConflict: "user_id,role" },
      );
    if (error) mapRoleError(error);
    ctx.detail({ outcome: "granted" });
    return { outcome: "granted" };
  },
  {
    schema: z.object({
      userId: z.string().uuid(RT.errors.person),
      role: roleEnum,
      sections: SectionsInput,
      justification: z.string().max(2000).optional(),
    }),
    objectRef: (i) => `user:${i.userId}`,
    auditAs: "role.grant",
  },
);

export const revokeRole = studioAction(
  "users.manage",
  () => ({}),
  async (input: { userId: string; role: Role }, ctx) => {
    if (input.userId === ctx.userId) throw new StudioFailure("forbidden", RT.errors.self);
    const { data, error } = await ctx.db
      .from("user_roles")
      .delete()
      .eq("user_id", input.userId)
      .eq("role", input.role)
      .select("user_id");
    if (error) mapRoleError(error);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ role: input.role });
    return { userId: input.userId };
  },
  {
    schema: z.object({ userId: z.string().uuid(RT.errors.person), role: roleEnum }),
    objectRef: (i) => `user:${i.userId}`,
    auditAs: "role.revoke",
  },
);

export const setRoleSections = studioAction(
  "users.manage",
  () => ({}),
  async (input: { userId: string; role: Role; sections: string[] }, ctx) => {
    if (input.userId === ctx.userId) throw new StudioFailure("forbidden", RT.errors.self);
    await assertSections(input.sections);
    const { data, error } = await ctx.db
      .from("user_roles")
      .update({ sections: input.sections })
      .eq("user_id", input.userId)
      .eq("role", input.role)
      .select("user_id");
    if (error) mapRoleError(error);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ role: input.role, sections: input.sections });
    return { userId: input.userId };
  },
  {
    schema: z.object({
      userId: z.string().uuid(RT.errors.person),
      role: roleEnum,
      sections: SectionsInput,
    }),
    objectRef: (i) => `user:${i.userId}`,
    auditAs: "role.sections",
  },
);

export interface RoleHistoryRow {
  id: number;
  at: string;
  action: string;
  actorName: string;
  objectRef: string;
  targetName: string | null;
  details: Record<string, unknown>;
}

const HISTORY_ACTIONS = [
  "role.grant",
  "role.revoke",
  "role.sections",
  "user.invite",
  "user.invite_revoke",
];

/** Últimas alterações de papéis e convites (audit_log; RLS `audit.view`). */
export async function roleHistory(limit = 30): Promise<RoleHistoryRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("audit_log")
    .select("id, at, actor, action, object_ref, details")
    .in("action", HISTORY_ACTIONS)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`histórico: ${error.message}`);
  const rows = data ?? [];
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.actor);
    if (r.object_ref.startsWith("user:")) ids.add(r.object_ref.slice(5));
  }
  const names = new Map<string, string>();
  const uuids = [...ids].filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  if (uuids.length > 0) {
    const { data: ps, error: pe } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", uuids);
    if (pe) throw new Error(`histórico (pessoas): ${pe.message}`);
    for (const p of ps ?? []) names.set(p.id, p.display_name);
  }
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    actorName: names.get(r.actor) ?? "Pessoa removida",
    objectRef: r.object_ref,
    targetName: r.object_ref.startsWith("user:")
      ? (names.get(r.object_ref.slice(5)) ?? null)
      : null,
    details:
      typeof r.details === "object" && r.details !== null && !Array.isArray(r.details)
        ? (r.details as Record<string, unknown>)
        : {},
  }));
}
