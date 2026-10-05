import { Skeleton } from "@/components";
import { SOURCES_LIST_TEXT } from "@/content/pt-BR/sources-admin";

/** Esqueleto da lista de fontes (spec §8, O03): 8 linhas, `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{SOURCES_LIST_TEXT.title}</p>
      <Skeleton shape="block" className="h-9 w-40" />
      <Skeleton shape="block" className="h-28" />
      <Skeleton shape="card" rows={8} lines={2} />
    </div>
  );
}
