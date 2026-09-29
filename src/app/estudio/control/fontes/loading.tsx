import { StudioLoading } from "@/components";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";

/** Carregando a lista: esqueleto anunciado (`role="status"`), sob `aria-busy`. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <StudioLoading label={T.loading} />
    </div>
  );
}
