import { Skeleton } from "@/components";
import { PUSH_SETTINGS_TEXT } from "@/content/pt-BR/notifications-admin";

/** Esqueleto das Configurações (docs/screens.md, estado carregando). */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{PUSH_SETTINGS_TEXT.title}</p>
      <div className="h-7 w-48 bg-section" />
      <div className="flex flex-col gap-4 rounded-lg border border-line-section bg-card-white p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
