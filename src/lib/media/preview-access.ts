import { can, type RoleGrant } from "@/lib/auth/permissions";
import { MULTI_SECTION } from "@/lib/studio/scope";

/** Imagem pedida na prévia do Estúdio, com as matérias que a usam. */
export interface PreviewTarget {
  /** `media_assets.status` (`pending`, `approved`, `blocked`). */
  status: string;
  articles: { section: string; authorId: string | null }[];
}

/**
 * Prévia do Estúdio (`/api/estudio/midia/[id]`, C3-02): as mesmas permissões das telas que a
 * mostram. `media.approve` no escopo da imagem (mesma regra de `mediaScope`: uma editoria, várias
 * ou nenhuma) vê qualquer estado; `article.edit` numa matéria que usa a imagem vê pendente ou
 * aprovada, nunca bloqueada. Papel sem uma dessas permissões não vê nada.
 */
export function canPreviewMedia(roles: RoleGrant[], userId: string, m: PreviewTarget): boolean {
  const sections = [...new Set(m.articles.map((a) => a.section))];
  const scope =
    sections.length === 0 ? {} : { section: sections.length === 1 ? sections[0]! : MULTI_SECTION };
  if (can(roles, "media.approve", { ...scope, userId })) return true;
  if (m.status === "blocked") return false;
  return m.articles.some((a) =>
    can(roles, "article.edit", {
      section: a.section,
      ...(a.authorId ? { ownerId: a.authorId } : {}),
      userId,
    }),
  );
}
