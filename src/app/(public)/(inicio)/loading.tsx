// Fica no grupo (inicio) para não envolver as outras rotas: com loading.tsx acima delas, a
// resposta começa em streaming e 404/410 viram 200 (docs de loading.js, "Status codes").
import { Skeleton } from "@/components";
import { HOME } from "@/content/pt-BR/portal-home";

/** Esqueleto das páginas públicas enquanto os dados chegam (docs/screens.md, estado loading). */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-page flex-col gap-6 px-gutter py-10"
    >
      <p className="sr-only">{HOME.loading}</p>
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Skeleton shape="block" className="aspect-video w-full" />
          <Skeleton shape="block" className="h-10 w-3/4" />
          <Skeleton shape="block" className="h-5 w-1/2" />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4">
          <Skeleton shape="block" className="h-6 w-24" />
          <Skeleton shape="block" className="h-16" />
          <Skeleton shape="block" className="h-16" />
          <Skeleton shape="block" className="h-16" />
        </div>
      </div>
      <div className="flex gap-3 overflow-hidden">
        <Skeleton shape="block" className="h-32 w-72 shrink-0" />
        <Skeleton shape="block" className="h-32 w-72 shrink-0" />
        <Skeleton shape="block" className="h-32 w-72 shrink-0" />
      </div>
    </div>
  );
}
