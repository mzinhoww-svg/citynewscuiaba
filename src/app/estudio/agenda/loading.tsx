import { Skeleton } from "@/components";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";

/** Esqueleto da Agenda do Estúdio (AGM-T7): abas, filtros e linhas, `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{T.title}</p>
      <Skeleton shape="block" className="h-9 w-40" />
      <Skeleton shape="block" className="h-11" />
      <Skeleton shape="block" className="h-28" />
      <Skeleton shape="card" rows={8} lines={2} />
    </div>
  );
}
