import { PageLoading } from "@/components";
import { ALERTS_TEXT as T } from "@/content/pt-BR/alerts";

/** Carregando Alertas (UI-T14): mesmo cabeçalho e grid da página pronta. */
export default function AlertsLoading() {
  return <PageLoading title={T.title} label={T.loading} />;
}
