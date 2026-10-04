import { PageLoading } from "@/components";
import { FAVORITES_TEXT as T } from "@/content/pt-BR/favorites";

/** Carregando Favoritos (UI-T14): mesmo cabeçalho e grid da página pronta. */
export default function FavoritesLoading() {
  return <PageLoading title={T.title} label={T.loading} />;
}
