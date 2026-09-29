import { Skeleton } from "@/components";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";

/** Esqueleto da seção da fonte (o cabeçalho vem do layout), `aria-busy`. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only">{DETAIL_TEXT.loading}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-lg bg-section" />
        ))}
      </div>
      <div className="rounded-lg border border-line-section bg-card-white p-4">
        <Skeleton lines={4} />
      </div>
    </div>
  );
}
