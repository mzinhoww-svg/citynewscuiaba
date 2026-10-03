"use client";

import { useState } from "react";
import Link from "next/link";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { SAVE_TEXT } from "@/content/pt-BR/favorites";
import type { ReportState } from "@/lib/reports/form-state";
import { ReadingSettings } from "./ReadingSettings";
import { ReportProblemForm } from "./ReportProblemForm";
import { SaveButton } from "./SaveButton";
import { ShareSheet } from "./ShareSheet";

export interface ArticleActionsProps {
  article: { id: string; title: string; href: string; section: string };
  /** Server Action de "Informar problema". */
  reportAction: (state: ReportState, form: FormData) => Promise<ReportState>;
}

/**
 * Barra de ações da matéria (R24): salvar, compartilhar e ajustar leitura, todos do mesmo
 * tamanho (`sm`, 36 px com alvo de toque de 44), numa linha na largura da coluna principal.
 * "Informar problema" é um link discreto ao lado; a confirmação de "Salvo" fica abaixo da linha.
 *
 * ```tsx
 * <ArticleActions article={{ id, title, href, section }} reportAction={reportProblemAction} />
 * ```
 */
export function ArticleActions({ article, reportAction }: ArticleActionsProps) {
  const [justSaved, setJustSaved] = useState(false);
  return (
    <div className="flex flex-col border-y border-line-subtle py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div role="group" aria-label={ARTICLE.actions} className="flex items-center gap-2">
          <SaveButton
            contentRef={`article:${article.id}`}
            title={article.title}
            href={article.href}
            section={article.section}
            targetId="materia"
            buttonSize="sm"
            onJustSaved={setJustSaved}
          />
          <ShareSheet title={article.title} url={article.href} collapseLabel buttonSize="sm" />
          <ReadingSettings buttonSize="sm" />
        </div>
        <ReportProblemForm
          contentRef={`article:${article.id}`}
          action={reportAction}
          variant="link"
        />
      </div>
      <div aria-live="polite">
        {justSaved && (
          <p role="status" className="pb-1 pt-2 type-meta text-meta">
            {SAVE_TEXT.saved}{" "}
            <Link
              href="/favoritos"
              className="font-semibold text-link underline underline-offset-4"
            >
              {SAVE_TEXT.seeFavorites}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
