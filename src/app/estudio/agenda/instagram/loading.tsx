import { Skeleton } from "@/components";
import { STUDIO_SOCIAL_TEXT as T } from "@/content/pt-BR/studio-agenda";

/** Esqueleto do pacote do Instagram (ARD-T6): abas, semana, situação e a grade de slides. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{T.title}</p>
      <Skeleton shape="block" className="h-9 w-56" />
      <Skeleton shape="block" className="h-11" />
      <Skeleton shape="block" className="h-28" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} shape="block" className="aspect-[4/5]" />
        ))}
      </div>
    </div>
  );
}
