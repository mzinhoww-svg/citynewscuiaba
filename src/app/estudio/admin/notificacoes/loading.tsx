import { Skeleton } from "@/components";
import { NEW_PUSH_TEXT } from "@/content/pt-BR/notifications-admin";

/** Esqueleto do Novo envio (docs/screens.md, estado carregando): `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{NEW_PUSH_TEXT.title}</p>
      <Skeleton shape="block" className="h-7 w-40" />
      <Skeleton shape="card" rows={5} lines={2} />
    </div>
  );
}
