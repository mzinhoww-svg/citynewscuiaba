import "server-only";
import { z } from "zod";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { SECTION_SCOPED_ROLES } from "@/lib/admin/roles";
import { callbackUrl } from "@/lib/auth/links";
import { ROLES, type RoleGrant } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/db/client";
import { StudioFailure, studioAction } from "./action";

/*
 * Usuários e papéis (A02/A03, P5-T8). Tudo exige `users.manage` (admin) e audita.
 * - Convite: o Auth cria a conta e manda o link (service role, único jeito de convidar); o perfil
 *   e o papel entram na hora, e `staff_invites` mostra "Convite pendente" até o primeiro acesso.
 * - Papéis: conceder, mudar editorias e revogar numa ação só, inclusive administração (`role_set`,
 *   0158; A-128, A-150): pedido e aprovação pela mesma pessoa em `approvals`, aplicação e
 *   auditoria na mesma transação. Ninguém mexe no próprio papel.
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
  /** Uma linha de `approvals` por mudança (`role.grant`/`role.revoke`), pedida e aprovada aqui. */
  approvalIds: string[];
}

const RoleSetResult = z.object({
  granted: z.array(z.string()),
  updated: z.array(z.string()),
  revoked: z.array(z.string()),
  approvalIds: z.array(z.string().uuid()),
});

/** Recusa de `role_set` (0158) → erro de domínio com a mensagem da tela. */
function roleSetFailure(e: { code?: string; message: string }): StudioFailure | null {
  if (e.code === "42501")
    return new StudioFailure(
      "forbidden",
      /próprio papel/.test(e.message) ? T.users.rolesDialog.self : undefined,
    );
  if (e.code === "P0002") return new StudioFailure("not_found");
  if (e.code === "22023") {
    if (/justificativa/.test(e.message))
      return new StudioFailure("invalid", T.users.rolesDialog.justificationRequired);
    if (/editoria/.test(e.message))
      return new StudioFailure("invalid", T.users.rolesDialog.editorNeedsSection);
    return new StudioFailure("invalid");
  }
  return null;
}

/**
 * Papéis de uma pessoa numa ação só (item 61, A-150; A-128): `role_set` (0158) grava, na mesma
 * transação, um pedido `role.grant`/`role.revoke` por mudança com quem pediu e quem aprovou (a
 * mesma pessoa), aplica em `user_roles` e audita cada passo. Ou tudo acontece, ou nada.
 */
export const setRolesCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx): Promise<SetRolesOutcome> => {
    if (i.userId === ctx.userId) throw new StudioFailure("forbidden", T.users.rolesDialog.self);
    const wanted: RoleGrant[] = i.roles.map((r) => ({
      role: r.role,
      sections: SECTION_SCOPED_ROLES.includes(r.role) ? r.sections : [],
    }));
    if (wanted.some((r) => r.role === "editor" && r.sections.length === 0))
      throw new StudioFailure("invalid", T.users.rolesDialog.editorNeedsSection);
    const justification = i.justification?.trim();
    const { data, error } = await ctx.db.rpc("role_set", {
      p_user: i.userId,
      p_roles: wanted.map((r) => ({ role: r.role, sections: r.sections })),
      ...(justification ? { p_justification: justification } : {}),
    });
    if (error) throw roleSetFailure(error) ?? new Error(`role_set: ${error.message}`);
    const out = RoleSetResult.parse(data);
    ctx.detail(out);
    return out;
  },
  { schema: SetRolesInput, auditAs: "user.role.grant", objectRef: (i) => `user:${i.userId}` },
);
