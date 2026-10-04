import "server-only";
import { z } from "zod";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { SECTION_SCOPED_ROLES, planRoleChange } from "@/lib/admin/roles";
import { adminRevokeTarget, userTarget } from "@/lib/approvals/targets";
import { audit } from "@/lib/audit";
import { callbackUrl } from "@/lib/auth/links";
import { ROLES, type RoleGrant } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/db/client";
import { StudioFailure, studioAction } from "./action";
import { requestAndApproveCommand } from "./approvals";

/*
 * Usuários e papéis (A02/A03, P5-T8). Tudo exige `users.manage` (admin) e audita.
 * - Convite: o Auth cria a conta e manda o link (service role, único jeito de convidar); o perfil
 *   e o papel entram na hora, e `staff_invites` mostra "Convite pendente" até o primeiro acesso.
 * - Papéis: conceder/revogar/mudar editorias direto (RLS `user_roles_admin`); `admin` passa pelo
 *   pedido `role.admin` registrado (`guard_user_roles` consome). A-128: o admin que pede aprova e
 *   aplica na mesma ação; o pedido e a auditoria guardam quem fez. Ninguém mexe no próprio papel.
 */

const RoleGrantSchema = z.object({
  role: z.enum(ROLES),
  sections: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(20),
});

const InviteInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(T.users.inviteDialog.invalidEmail),
  role: z.enum(ROLES),
  sections: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .max(20)
    .optional(),
});
export type InviteInput = z.input<typeof InviteInput>;

export const inviteUserCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx) => {
    if (i.role === "admin") throw new StudioFailure("invalid", T.users.inviteDialog.hint);
    const svc = createServiceClient();
    // O Auth reenvia convite a conta já existente sem erro; aqui conta repetida é conflito.
    const existing = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (existing.error) throw new Error(`invite lookup: ${existing.error.message}`);
    if (existing.data.users.some((u) => u.email?.toLowerCase() === i.email))
      throw new StudioFailure("conflict", T.users.inviteDialog.exists);
    const invited = await svc.auth.admin.inviteUserByEmail(i.email, {
      data: { display_name: i.name },
      redirectTo: callbackUrl({ next: "/estudio" }),
    });
    if (invited.error) {
      if (/already|exists|registered/i.test(invited.error.message))
        throw new StudioFailure("conflict", T.users.inviteDialog.exists);
      throw new Error(`invite: ${invited.error.message}`);
    }
    const userId = invited.data.user.id;
    const sections = SECTION_SCOPED_ROLES.includes(i.role) ? (i.sections ?? []) : [];
    if (i.role === "editor" && sections.length === 0)
      throw new StudioFailure("invalid", T.users.rolesDialog.editorNeedsSection);
    const profile = await svc
      .from("profiles")
      .upsert({ id: userId, display_name: i.name }, { onConflict: "id" });
    if (profile.error) throw new Error(`invite profile: ${profile.error.message}`);
    const role = await svc.from("user_roles").insert({ user_id: userId, role: i.role, sections });
    if (role.error) throw new Error(`invite role: ${role.error.message}`);
    const inv = await ctx.db.from("staff_invites").insert({
      user_id: userId,
      email: i.email,
      role: i.role,
      sections,
      invited_by: ctx.userId,
    });
    if (inv.error) throw new Error(`invite row: ${inv.error.message}`);
    ctx.setObjectRef(`user:${userId}`);
    // O e-mail é dado pessoal e a auditoria é imutável: fica só o id da conta (gate P5, achado 9).
    ctx.detail({ role: i.role, sections });
    return { userId };
  },
  { schema: InviteInput, auditAs: "user.invite" },
);

const SetRolesInput = z.object({
  userId: z.string().uuid(),
  roles: z.array(RoleGrantSchema).max(ROLES.length),
  justification: z.string().trim().max(500).optional(),
});
export type SetRolesInput = z.input<typeof SetRolesInput>;

export interface SetRolesOutcome {
  granted: string[];
  revoked: string[];
  updated: string[];
  adminApprovalId: string | null;
  /** Pedido `role.admin` de revogação (alvo `revoke:<uuid>`), quando o papel de admin sai. */
  adminRevokeApprovalId: string | null;
  /** O papel de admin entrou nesta ação (pedido aprovado e aplicado pela mesma pessoa). */
  adminApplied: boolean;
  /** O papel de admin saiu nesta ação (pedido aprovado e aplicado pela mesma pessoa). */
  adminRevokeApplied: boolean;
}

/** Recusa do banco por falta da aprovação `role.admin` registrada. */
const isApprovalError = (e: { code?: string; message: string }) =>
  e.code === "42501" || /aprovação|two_person/.test(e.message);

export const setRolesCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx): Promise<SetRolesOutcome> => {
    if (i.userId === ctx.userId) throw new StudioFailure("forbidden", T.users.rolesDialog.self);
    const { data: current, error } = await ctx.db
      .from("user_roles")
      .select("role, sections")
      .eq("user_id", i.userId);
    if (error) throw new Error(`roles: ${error.message}`);
    const wanted: RoleGrant[] = i.roles.map((r) => ({
      role: r.role,
      sections: SECTION_SCOPED_ROLES.includes(r.role) ? r.sections : [],
    }));
    if (wanted.some((r) => r.role === "editor" && r.sections.length === 0))
      throw new StudioFailure("invalid", T.users.rolesDialog.editorNeedsSection);
    const plan = planRoleChange(
      (current ?? []).flatMap((r) =>
        ROLES.includes(r.role) ? [{ role: r.role, sections: r.sections }] : [],
      ),
      wanted,
    );

    for (const g of plan.grant) {
      const r = await ctx.db
        .from("user_roles")
        .insert({ user_id: i.userId, role: g.role, sections: g.sections });
      if (r.error) throw new Error(`grant ${g.role}: ${r.error.message}`);
      await audit(
        ctx.userId,
        "user.role.grant",
        `user:${i.userId}`,
        { role: g.role, sections: g.sections },
        ctx.db,
      );
    }
    for (const u of plan.update) {
      const r = await ctx.db
        .from("user_roles")
        .update({ sections: u.sections })
        .eq("user_id", i.userId)
        .eq("role", u.role);
      if (r.error) throw new Error(`update ${u.role}: ${r.error.message}`);
      await audit(
        ctx.userId,
        "user.role.grant",
        `user:${i.userId}`,
        { role: u.role, sections: u.sections, update: true },
        ctx.db,
      );
    }
    // Revogar `admin` também é mudança crítica (spec §8): o banco só deixa apagar com pedido
    // `role.admin` (alvo `revoke:<uuid>`) aprovado; sem ele, registra o pedido, aprova (A-128: o
    // admin que pede decide) e apaga de novo, agora consumindo a aprovação.
    const revoked: string[] = [];
    let adminRevokeApprovalId: string | null = null;
    let adminRevokeApplied = false;
    for (const role of plan.revoke) {
      const r = await ctx.db.from("user_roles").delete().eq("user_id", i.userId).eq("role", role);
      if (r.error) {
        if (role !== "admin" || !isApprovalError(r.error))
          throw new Error(`revoke ${role}: ${r.error.message}`);
        if (!i.justification?.trim())
          throw new StudioFailure("invalid", T.users.rolesDialog.justificationRequired);
        const req = await requestAndApproveCommand({
          kind: "role.admin",
          targetRef: adminRevokeTarget(i.userId),
          justification: i.justification,
          objectRef: `user:${i.userId}`,
          details: { revoke: "admin" },
        });
        if (!req.ok) throw new StudioFailure(req.error, req.message);
        adminRevokeApprovalId = req.value.id;
        if (req.value.status === "pending") continue;
        const again = await ctx.db
          .from("user_roles")
          .delete()
          .eq("user_id", i.userId)
          .eq("role", "admin");
        if (again.error) throw new StudioFailure("conflict", T.users.rolesDialog.revokePending);
        adminRevokeApplied = true;
      }
      revoked.push(role);
      await audit(
        ctx.userId,
        "user.role.revoke",
        `user:${i.userId}`,
        role === "admin" && adminRevokeApprovalId
          ? { role, approvalId: adminRevokeApprovalId }
          : { role },
        ctx.db,
      );
    }

    let adminApprovalId: string | null = null;
    let adminApplied = false;
    if (plan.adminRequested) {
      if (!i.justification?.trim())
        throw new StudioFailure("invalid", T.users.rolesDialog.justificationRequired);
      const r = await requestAndApproveCommand({
        kind: "role.admin",
        targetRef: userTarget(i.userId),
        justification: i.justification,
        objectRef: `user:${i.userId}`,
      });
      if (!r.ok) throw new StudioFailure(r.error, r.message);
      adminApprovalId = r.value.id;
      if (r.value.status !== "pending") {
        const g = await ctx.db
          .from("user_roles")
          .insert({ user_id: i.userId, role: "admin", sections: [] });
        if (g.error) throw new StudioFailure("conflict", T.users.rolesDialog.adminPending);
        adminApplied = true;
        await audit(
          ctx.userId,
          "user.role.grant",
          `user:${i.userId}`,
          { role: "admin", sections: [], approvalId: adminApprovalId },
          ctx.db,
        );
      }
    }
    const granted = [...plan.grant.map((g) => g.role), ...(adminApplied ? ["admin"] : [])];
    ctx.detail({
      granted,
      revoked,
      updated: plan.update.map((u) => u.role),
      adminApprovalId,
      adminRevokeApprovalId,
      adminApplied,
      adminRevokeApplied,
    });
    return {
      granted,
      revoked,
      updated: plan.update.map((u) => u.role),
      adminApprovalId,
      adminRevokeApprovalId,
      adminApplied,
      adminRevokeApplied,
    };
  },
  { schema: SetRolesInput, auditAs: "user.role.grant", objectRef: (i) => `user:${i.userId}` },
);

const ApplyAdminInput = z.object({ userId: z.string().uuid() });

/** Aplica o papel de administração já aprovado (o trigger consome o pedido). */
export const applyAdminRoleCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx) => {
    if (i.userId === ctx.userId) throw new StudioFailure("forbidden", T.users.rolesDialog.self);
    const r = await ctx.db
      .from("user_roles")
      .insert({ user_id: i.userId, role: "admin", sections: [] });
    if (r.error) {
      if (/aprovação|two_person|42501/.test(r.error.message) || r.error.code === "42501")
        throw new StudioFailure("conflict", T.users.rolesDialog.adminPending);
      if (r.error.code === "23505")
        throw new StudioFailure("conflict", T.users.rolesDialog.applied);
      throw new Error(`apply admin: ${r.error.message}`);
    }
    ctx.detail({ role: "admin" });
    return { applied: true };
  },
  { schema: ApplyAdminInput, auditAs: "user.role.grant", objectRef: (i) => `user:${i.userId}` },
);

/** Aplica a revogação de admin já aprovada (o trigger consome o pedido). */
export const applyAdminRevokeCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx) => {
    if (i.userId === ctx.userId) throw new StudioFailure("forbidden", T.users.rolesDialog.self);
    const r = await ctx.db
      .from("user_roles")
      .delete()
      .eq("user_id", i.userId)
      .eq("role", "admin")
      .select("user_id");
    if (r.error) {
      if (isApprovalError(r.error))
        throw new StudioFailure("conflict", T.users.rolesDialog.revokePending);
      throw new Error(`apply revoke admin: ${r.error.message}`);
    }
    if ((r.data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ role: "admin" });
    return { applied: true };
  },
  { schema: ApplyAdminInput, auditAs: "user.role.revoke", objectRef: (i) => `user:${i.userId}` },
);
