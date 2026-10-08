import type { ReactNode } from "react";

export interface LoadingRegionProps {
  /** Frase lida pelo leitor de tela ("Carregando a agenda"). */
  label: string;
  /** Classes da área com os esqueletos (grade, espaçamento). */
  className?: string;
  /** Esqueletos com a forma do conteúdo (`Skeleton`). */
  children: ReactNode;
}

/**
 * Área de carregamento (item 87): o aviso fica num `role="status"` fora do nó com
 * `aria-busy` (leitor de tela pode calar o que está dentro de uma área ocupada), e a área
 * ocupada guarda só os esqueletos. O aviso é `sr-only` (fora do fluxo), então a grade de
 * `className` vale para os esqueletos.
 *
 * ```tsx
 * <LoadingRegion label={AGENDA.loading} className="flex flex-col gap-4">
 *   <Skeleton media lines={4} />
 * </LoadingRegion>
 * ```
 */
export function LoadingRegion({ label, className, children }: LoadingRegionProps) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-busy="true" className={className}>
        {children}
      </div>
    </>
  );
}
