"use client";

import { useState } from "react";
import Link from "next/link";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { SAVE_TEXT } from "@/content/pt-BR/favorites";
import { ReadingSettings } from "./ReadingSettings";
import { SaveButton } from "./SaveButton";
import { ShareSheet } from "./ShareSheet";

export interface ArticleActionsProps {
  article: { id: string; title: string; href: string; section: string };
}

/**
 * Barra de ações da matéria (R24, UX item 75): salvar, compartilhar e ajustar leitura, todos do
 * mesmo tamanho (`md`, 44 px) com 12 px de folga, numa linha na largura da coluna principal. A
 * confirmação de "Salvo" fica abaixo da linha. "Informar problema" tem uma entrada só (item 74):
 * no bloco "De onde veio" (`MadeHow`), ao lado do histórico de versões.
 *
 * ```tsx
 * <ArticleActions article={{ id, title, href, section }} />
 * ```
 */
export function ArticleActions({ article }: ArticleActionsProps) {
  const [justSaved, setJustSaved] = useState(false);
  return (
    <div className="flex flex-col border-y border-line-subtle py-2">
      <div role="group" aria-label={ARTICLE.actions} className="flex flex-wrap items-center gap-3">
        <SaveButton
          contentRef={`article:${article.id}`}
          title={article.title}
          href={article.href}
          section={article.section}
          targetId="materia"
          buttonSize="md"
          onJustSaved={setJustSaved}
        />
        <ShareSheet title={article.title} url={article.href} collapseLabel buttonSize="md" />
        <ReadingSettings buttonSize="md" />
      </div>
      <div aria-live="polite">
        {justSaved && (
          <p role="status" className="pt-1 type-meta text-meta">
            {SAVE_TEXT.saved}{" "}
            <Link
              href="/favoritos"
              className="inline-flex min-h-tap items-center font-semibold text-link underline underline-offset-4"
            >
              {SAVE_TEXT.seeFavorites}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
