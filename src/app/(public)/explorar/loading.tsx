import { Skeleton } from "@/components";
import { EXPLORE } from "@/content/pt-BR/explore";

/** Esqueleto do Explorar enquanto os dados chegam (estado loading). */
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-10">
      <p className="sr-only">{EXPLORE.loading}</p>
      <Skeleton shape="block" className="h-8 w-1/4 max-w-xs" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
