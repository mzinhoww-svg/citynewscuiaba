import Link from "next/link";
import type { ReactNode } from "react";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface StudioBreadcrumb {
  href: string;
  label: string;
}

export interface StudioScreenProps {
  /** Rótulo da seção acima do título (Control Center, Administração). */
  section?: string;
  title: string;
  /** Introdução ou metadados abaixo do título. */
  intro?: ReactNode;
  /** Ações à direita do cabeçalho (abaixo, no celular). */
  actions?: ReactNode;
  /** Caminho até a tela; o último item é a própria tela (`aria-current="page"`). */
  breadcrumbs?: readonly StudioBreadcrumb[];
  /** Estado de erro: aparece no lugar do conteúdo, com o cabeçalho mantido. */
  error?: ReactNode;
  /** Espaço entre o cabeçalho e os blocos. Padrão `md` (24 px); `lg` = 32 px. */
  gap?: "md" | "lg";
  /** Elemento raiz: `article` nas telas de um objeto só (matéria, imagem). */
  as?: "section" | "article";
  children?: ReactNode;
}

/**
 * Moldura das telas do Estúdio (item 57): caminho, rótulo da seção, título, introdução, ações e,
 * quando a leitura falha, o erro no lugar do conteúdo. Título longo quebra em vez de estourar.
 *
 * ```tsx
 * <StudioScreen section="Control Center" title="Execuções" intro="Ciclos do pipeline.">
 *   <RunsTable … />
 * </StudioScreen>
 * ```
 */
export function StudioScreen({
  section,
  title,
  intro,
  actions,
  breadcrumbs,
  error,
  gap = "md",
  as: Root = "section",
  children,
}: StudioScreenProps) {
  const crumbs = breadcrumbs ?? [];
  return (
    <Root className={cx("flex min-w-0 flex-col", gap === "lg" ? "gap-8" : "gap-6")}>
      <header className="flex flex-col gap-3">
        {crumbs.length > 0 && (
          <nav aria-label={STUDIO_TEXT.breadcrumbs}>
            <ol className="flex flex-wrap items-center gap-x-1 type-meta text-meta">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={c.href} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <Icon name="chevron-right" size={14} className="shrink-0" />}
                    <Link
                      href={c.href}
                      aria-current={last ? "page" : undefined}
                      className={cx(
                        "inline-flex min-h-tap min-w-0 items-center break-words underline-offset-4 hover:underline",
                        last ? "text-meta no-underline" : "text-link",
                      )}
                    >
                      {c.label}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            {section && <p className="type-eyebrow">{section}</p>}
            <h1 className="type-screen-title text-strong break-words">{title}</h1>
            {intro != null &&
              (typeof intro === "string" ? (
                <p className="max-w-read type-body text-meta">{intro}</p>
              ) : (
                intro
              ))}
          </div>
          {actions != null && <div className="shrink-0">{actions}</div>}
        </div>
      </header>
      {error ?? children}
    </Root>
  );
}
