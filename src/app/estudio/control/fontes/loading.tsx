import { Skeleton } from "@/components";
import { SOURCES_LIST_TEXT } from "@/content/pt-BR/sources-admin";

/** Esqueleto da lista de fontes (spec §8, O03): 8 linhas, `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{SOURCES_LIST_TEXT.title}</p>
      <div className="h-9 w-40 bg-section" />
      <div className="h-28 bg-section" />
      <div className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
