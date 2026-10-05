import { Skeleton } from "@/components";
import { PUSH_SETTINGS_TEXT } from "@/content/pt-BR/notifications-admin";

/** Esqueleto das Configurações (docs/screens.md, estado carregando). */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{PUSH_SETTINGS_TEXT.title}</p>
      <Skeleton shape="block" className="h-7 w-48" />
      <Skeleton shape="card" rows={4} lines={2} />
    </div>
  );
}
