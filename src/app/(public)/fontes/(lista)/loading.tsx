import { Skeleton } from "@/components";
import { SOURCES_PAGE } from "@/content/pt-BR/sources-list";

/** Esqueleto de Fontes em destaque enquanto os sinais chegam (estado loading). */
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-10">
      <p className="sr-only">{SOURCES_PAGE.loading}</p>
      <Skeleton shape="block" className="h-12 w-1/2 max-w-md" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} shape="block" round="pill" className="size-16 shrink-0" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
