import type { ReactNode } from "react";
import { cx } from "../cx";
import { Skeleton } from "../ui/Skeleton";

/** Contêiner das páginas públicas: a mesma largura e margem de Busca, Explorar e editorias. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-page px-gutter";

export interface PageHeaderProps {
  title: string;
  /** Texto de apoio, na medida de leitura (68ch). */
  intro?: ReactNode;
  /** Linha de metadado abaixo do texto (data da versão, limites). */
  meta?: ReactNode;
  /** Conteúdo extra no cabeçalho (ex.: navegação da página). */
  children?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de página de serviço (UI-T14): o mesmo título de tela (`type-screen-title`) e o
 * mesmo fio de Busca, Explorar e editorias, para que Conta, Favoritos, Alertas e páginas legais
 * não pareçam outro site. O título fica menor que a manchete da home.
 *
 * ```tsx
 * <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
 *   <PageHeader title="Favoritos" intro="O que você guardou neste navegador." />
 * </div>
 * ```
 */
export interface PageLoadingProps {
  title: string;
  /** Texto para leitor de tela ("Carregando seus favoritos"). */
  label: string;
}

/**
 * Carregando das páginas de serviço (Perfil, Favoritos, Alertas): o mesmo cabeçalho e o mesmo
 * grid de 8 + 4 colunas da página pronta, para nada saltar quando os dados chegam.
 */
export function PageLoading({ title, label }: PageLoadingProps) {
  return (
    <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <PageHeader title={title} intro={<Skeleton lines={1} className="max-w-md" />} />
      <div
        aria-busy="true"
        aria-live="polite"
        className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-6"
      >
        <p className="sr-only">{label}</p>
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Skeleton lines={3} />
          <Skeleton lines={3} />
        </div>
        <Skeleton lines={4} className="lg:col-span-4" />
      </div>
    </div>
  );
}

export function PageHeader({ title, intro, meta, children, className }: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-4 border-b border-line-strong pb-4", className)}>
      <div className="flex max-w-read flex-col gap-2">
        <h1 className="type-screen-title text-balance text-strong">{title}</h1>
        {intro && <div className="type-body text-body">{intro}</div>}
        {meta && <div className="type-meta text-meta">{meta}</div>}
      </div>
      {children}
    </header>
  );
}
