import { PageLoading } from "@/components";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";

/** Carregando Perfil (UI-T14): mesmo cabeçalho e grid da página pronta. */
export default function ProfileLoading() {
  return <PageLoading title={T.title} label={T.loading} />;
}
