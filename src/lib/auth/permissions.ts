/**
 * Matriz de permissões do Estúdio e do Control Center (docs/architecture.md §6).
 * Espelhada nas políticas RLS de supabase/migrations/0002_rls.sql. Função pura, sem framework.
 */
import { internalPath } from "./safe-path";

export const ROLES = [
  "admin",
  "editor_chefe",
  "editor",
  "jornalista",
  "revisor",
  "operador_ia",
  "analista",
  "moderador",
  "leitura",
] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "article.edit",
  "article.publish",
  "article.unpublish_auto",
  "correction.manage",
  "media.approve",
  "source.manage",
  "source.approve_critical",
  "rules.propose",
  "rules.approve",
  "prompt.publish",
  "rec.weights",
  "reports.moderate",
  "users.manage",
  "metrics.view",
  "audit.view",
  "push.request",
  "push.approve",
  "push.settings",
  "push.metrics",
  /** Administração do site (P5-T8/T9): taxonomia, home, publicidade, SEO e governança editorial. */
  "site.manage",
  /** Destaques por posição (FD-T3): fixar, remover e reordenar matérias em home, editorias e explorar. */
  "featured.manage",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * - `all`: em qualquer escopo.
 * - `section`: só nas editorias do papel (`scope.section` ∈ `sections`).
 * - `own`: só em objetos da própria pessoa (`scope.ownerId === scope.userId`).
 * - `first` / `second`: assinatura de mudança crítica (1ª propõe, 2ª aprova; pessoas diferentes,
 *   garantido por `approvals` e pelos checks do banco). Para `can`, ambas permitem.
 */
export type Grant = "all" | "section" | "own" | "first" | "second";

export interface RoleGrant {
  role: Role;
  sections: string[];
}

export interface Scope {
  section?: string;
  ownerId?: string;
  userId?: string;
}

type Matrix = Record<Action, Partial<Record<Role, Grant>>>;

/** Papel ausente numa linha = "não". */
export const PERMISSIONS: Matrix = {
  "article.edit": { editor_chefe: "all", editor: "section", jornalista: "own" },
  "article.publish": { editor_chefe: "all", editor: "section" },
  "article.unpublish_auto": { editor_chefe: "all", editor: "section" },
  "correction.manage": { editor_chefe: "all", editor: "section", revisor: "all" },
  "media.approve": { editor_chefe: "all", editor: "section", revisor: "all" },
  "source.manage": { admin: "all", editor_chefe: "all", operador_ia: "all" },
  /** Segunda assinatura de mudança crítica de fonte (painel de fontes, D-F4). */
  "source.approve_critical": { admin: "second", editor_chefe: "second" },
  "rules.propose": { admin: "all", editor_chefe: "all", operador_ia: "all" },
  "rules.approve": { admin: "all", editor_chefe: "second" },
  "prompt.publish": { admin: "second", editor_chefe: "second", operador_ia: "first" },
  "rec.weights": { admin: "all", operador_ia: "all" },
  "reports.moderate": { editor_chefe: "all", moderador: "all" },
  "users.manage": { admin: "all" },
  "metrics.view": {
    admin: "all",
    editor_chefe: "all",
    editor: "section",
    operador_ia: "all",
    analista: "all",
    leitura: "all",
  },
  "audit.view": { admin: "all", editor_chefe: "all", operador_ia: "all", leitura: "all" },
  /** Push (spec 2026-09-28 §10.1): urgente só admin/editor-chefe; Destaque por editoria. */
  "push.request": { admin: "all", editor_chefe: "all", editor: "section" },
  "push.approve": { admin: "second", editor_chefe: "second" },
  "push.settings": { admin: "all", editor_chefe: "all" },
  "push.metrics": { admin: "all", editor_chefe: "all", analista: "all" },
  "site.manage": { admin: "all", editor_chefe: "all" },
  "featured.manage": { admin: "all", editor_chefe: "all" },
};

export function grantOf(role: Role, action: Action): Grant | undefined {
  return PERMISSIONS[action][role];
}

function allows(grant: Grant | undefined, sections: string[], scope: Scope): boolean {
  switch (grant) {
    case "all":
    case "first":
    case "second":
      return true;
    case "section":
      return scope.section !== undefined && sections.includes(scope.section);
    case "own":
      return (
        scope.ownerId !== undefined && scope.userId !== undefined && scope.ownerId === scope.userId
      );
    default:
      return false;
  }
}

/**
 * Pode executar `action` sobre o objeto descrito em `scope`?
 * Ações por editoria exigem `scope.section`; ações sobre as próprias exigem `ownerId` e `userId`.
 * Escopo ausente nunca libera uma permissão restrita.
 */
export function can(roles: RoleGrant[], action: Action, scope: Scope = {}): boolean {
  return roles.some(({ role, sections }) => allows(grantOf(role, action), sections, scope));
}

/**
 * Tem a ação em algum escopo? Serve para entrar numa página ou mostrar um item de menu;
 * a checagem do objeto (editoria, autoria) continua sendo `can` com escopo.
 */
export function canAccess(roles: RoleGrant[], action: Action): boolean {
  return roles.some(({ role, sections }) => {
    const grant = grantOf(role, action);
    if (grant === "section") return sections.length > 0;
    return grant !== undefined;
  });
}

export interface Session {
  userId: string;
  /** E-mail da conta, quando o Supabase Auth informa (exibição no Estúdio). */
  email?: string;
  roles: RoleGrant[];
  /** A sessão da equipe passou de `security.session_hours`: `roles` vem vazio até entrar de novo. */
  expired?: boolean;
}

export type AccessDecision = { ok: true } | { ok: false; redirectTo: string };

const DEFAULT_NEXT = "/estudio";

function safeNext(next: string | undefined): string {
  return internalPath(next) ?? DEFAULT_NEXT;
}

export function loginRedirect(next?: string, reason?: "sem-permissao" | "sessao-expirada"): string {
  const params = new URLSearchParams({ next: safeNext(next) });
  if (reason) params.set("motivo", reason);
  return `/entrar?${params.toString()}`;
}

/**
 * Decisão de acesso usada por `requireRole`. Sem escopo, vale `canAccess` (página);
 * com escopo, vale `can` com o usuário da sessão. Sem sessão ou sem permissão, volta para
 * `/entrar?next=` (sem permissão acrescenta `motivo=sem-permissao`).
 */
export function resolveAccess(
  session: Session | null,
  action: Action,
  scope: Omit<Scope, "userId"> | undefined,
  next?: string,
): AccessDecision {
  if (!session) return { ok: false, redirectTo: loginRedirect(next) };
  if (session.expired) return { ok: false, redirectTo: loginRedirect(next, "sessao-expirada") };
  const allowed = scope
    ? can(session.roles, action, { ...scope, userId: session.userId })
    : canAccess(session.roles, action);
  return allowed ? { ok: true } : { ok: false, redirectTo: loginRedirect(next, "sem-permissao") };
}
