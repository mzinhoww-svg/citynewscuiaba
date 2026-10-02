/**
 * Permissões do push como funções puras (spec 2026-09-28 §10.1). Urgente só admin/editor-chefe;
 * Destaque por `push.request` no escopo da editoria; espelho de `push_can` (0041).
 */
import { can, canAccess, type RoleGrant } from "@/lib/auth/permissions";
import type { PushKind } from "./types";

export type RequestableKind = Exclude<PushKind, "follow">;

export const PUSH_ACTIONS = [
  "push.request",
  "push.approve",
  "push.settings",
  "push.metrics",
] as const;

/** Tipos que a pessoa pode pedir para uma matéria da editoria `section`. */
export function pushKindsFor(roles: RoleGrant[], section?: string): RequestableKind[] {
  const out: RequestableKind[] = [];
  if (roles.some((r) => r.role === "admin" || r.role === "editor_chefe")) out.push("urgent");
  if (
    section !== undefined
      ? can(roles, "push.request", { section })
      : canAccess(roles, "push.request")
  )
    out.push("highlight");
  return out;
}

/** Pode pedir urgente (qualquer matéria)? */
export function canRequestUrgent(roles: RoleGrant[]): boolean {
  return pushKindsFor(roles).includes("urgent");
}

/** Vê todos os pedidos e envios (senão só os próprios e os da editoria). */
export function canSeeAllPushes(roles: RoleGrant[]): boolean {
  return canAccess(roles, "push.approve") || canAccess(roles, "push.settings");
}

/** Tem alguma ação de push (item de menu "Notificações", G11)? */
export function hasAnyPushAction(roles: RoleGrant[]): boolean {
  return PUSH_ACTIONS.some((a) => canAccess(roles, a));
}
