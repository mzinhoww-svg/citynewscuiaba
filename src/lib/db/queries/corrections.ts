import "server-only";
import type { Result } from "@/lib/result";
import { articleHref } from "./articles";
import { many, readPublic } from "./run";
import type { PublicCorrection, QueryError } from "./types";

/** Correções mudam pouco e a lista é pública: 300 s no cache de dados, tag `corrections`. */
export const CORRECTIONS_REVALIDATE = 300;

/**
 * Correções publicadas (P24, /correcoes), mais recentes primeiro. A RLS só mostra as que têm
 * `published_at`; matéria que saiu do ar continua listada, sem link.
 */
export async function listCorrections(
  limit = 100,
): Promise<Result<PublicCorrection[], QueryError>> {
  return readPublic(
    async (db) => {
      const rows = await db
        .from("corrections")
        .select("id, kind, public_note, published_at, articles(slug, title)")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)))
        .then(many);
      return rows.flatMap((r) =>
        r.published_at
          ? [
              {
                id: r.id,
                kind: r.kind === "right_of_reply" ? "right_of_reply" : "correction",
                note: r.public_note,
                publishedAt: r.published_at,
                article: r.articles
                  ? { title: r.articles.title, href: articleHref(r.articles.slug) }
                  : null,
              } satisfies PublicCorrection,
            ]
          : [],
      );
    },
    { tags: ["corrections"], revalidate: CORRECTIONS_REVALIDATE },
  );
}
