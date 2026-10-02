import { Skeleton } from "../ui/Skeleton";

export interface StudioLoadingProps {
  /** Texto para leitores de tela ("Carregando a fila"). */
  label: string;
}

/** Estado de carregamento das telas do Estúdio: título e linhas em esqueleto, anunciado. */
export function StudioLoading({ label }: StudioLoadingProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <Skeleton lines={1} className="max-w-xs" />
      <Skeleton lines={3} />
      <Skeleton lines={4} />
    </div>
  );
}
