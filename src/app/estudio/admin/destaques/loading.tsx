import { StudioLoading } from "@/components/estudio";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";

/** Carregando os destaques: esqueleto com o rótulo anunciado a leitores de tela. */
export default function Loading() {
  return <StudioLoading label={T.loading} />;
}
