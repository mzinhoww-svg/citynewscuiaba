"use server";

import type { AdminReply } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import type { HomeModule } from "@/lib/admin/home-layout";
import type { Role, RoleGrant } from "@/lib/auth/permissions";
import {
  discardHomeDraftCommand,
  publishHomeCommand,
  saveHomeDraftCommand,
} from "@/lib/studio/admin-home";
import {
  createPlaceCommand,
  createSectionCommand,
  mergeTagsCommand,
  renameSectionCommand,
  togglePlaceCommand,
} from "@/lib/studio/admin-taxonomy";
import { deleteTeamCommand, saveTeamCommand } from "@/lib/studio/admin-teams";
import {
  applyAdminRevokeCommand,
  applyAdminRoleCommand,
  inviteUserCommand,
  setRolesCommand,
} from "@/lib/studio/admin-users";
import type { StudioResult } from "@/lib/studio/action";

/* Server Actions da Administração (P5-T8): camada fina sobre src/lib/studio/admin-*. */

function reply<O>(r: StudioResult<O>, ok: (v: O) => string): AdminReply {
  if (!r.ok) return { ok: false, message: r.message ?? T.genericError };
  return { ok: true, message: ok(r.value) };
}

export async function inviteUserAction(i: {
  name: string;
  email: string;
  role: Role;
  sections: string[];
}) {
  return reply(await inviteUserCommand(i), () => T.users.inviteDialog.sent(i.email));
}

export async function setRolesAction(i: {
  userId: string;
  roles: RoleGrant[];
  justification: string;
}) {
  return reply(await setRolesCommand(i), (v) =>
    v.adminApprovalId
      ? T.users.rolesDialog.adminRequested
      : v.adminRevokeApprovalId
        ? T.users.rolesDialog.revokeRequested
        : T.users.rolesDialog.saved,
  );
}

export async function applyAdminRoleAction(i: { userId: string }) {
  return reply(await applyAdminRoleCommand(i), () => T.users.rolesDialog.applied);
}

export async function applyAdminRevokeAction(i: { userId: string }) {
  return reply(await applyAdminRevokeCommand(i), () => T.users.rolesDialog.revokeApplied);
}

export async function saveTeamAction(i: {
  id?: string;
  name: string;
  description: string;
  sections: string[];
  leadId: string | null;
  memberIds: string[];
}) {
  return reply(await saveTeamCommand(i), () => T.teams.dialog.saved(i.name));
}

export async function deleteTeamAction(i: { id: string }) {
  return reply(await deleteTeamCommand(i), (v) => T.teams.dialog.removed(v.name));
}

export async function createSectionAction(i: { name: string; parentSlug: string }) {
  return reply(await createSectionCommand(i), () => T.taxonomy.sectionDialog.created(i.name));
}

export async function renameSectionAction(i: { slug: string; name: string }) {
  return reply(await renameSectionCommand(i), () => T.taxonomy.renameDialog.done(i.slug, i.name));
}

export async function createPlaceAction(i: {
  name: string;
  kind: "bairro" | "municipio";
  inPhrase: string;
}) {
  return reply(await createPlaceCommand(i), () => T.taxonomy.placeDialog.created(i.name));
}

export async function togglePlaceAction(i: { slug: string; active: boolean }) {
  return reply(await togglePlaceCommand(i), (v) => T.taxonomy.placeToggled(v.name, i.active));
}

export async function mergeTagsAction(i: { from: string; into: string }) {
  return reply(await mergeTagsCommand(i), (v) => T.taxonomy.merged(i.from, i.into, v.links));
}

export async function saveHomeDraftAction(i: { modules: HomeModule[]; note: string }) {
  return reply(await saveHomeDraftCommand(i), (v) => T.home.saved(v.version));
}

export async function publishHomeAction(i: { id: string }) {
  return reply(await publishHomeCommand(i), (v) => T.home.publishedMsg(v.version));
}

export async function discardHomeDraftAction(i: { id: string }) {
  return reply(await discardHomeDraftCommand(i), () => T.home.discarded);
}
