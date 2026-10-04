import type { Metadata } from "next";
import { PAGE_CONTAINER, PageHeader } from "@/components";
import { FAVORITES_TEXT as T } from "@/content/pt-BR/favorites";
import { getSourceSignals } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo/metadata";
import { FavoritesClient } from "./FavoritesClient";

/**
 * Favoritos (P17): salvos, fontes e assuntos seguidos e coleções pessoais, tudo no perfil local
 * deste navegador (sem conta). Fora do índice: a página é pessoal.
 */
export const metadata: Metadata = {
  ...pageMetadata({
    title: T.title,
    documentTitle: T.metaTitle,
    description: T.metaDescription,
    path: "/favoritos",
  }),
  robots: { index: false, follow: true },
};

export default async function FavoritesRoute() {
  // Nomes das fontes para a aba de seguidas; sem banco, a aba mostra o identificador.
  const signals = await getSourceSignals({ window: "7d" });
  const names = signals.ok ? Object.fromEntries(signals.value.map((s) => [s.slug, s.name])) : {};
  return (
    <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <PageHeader title={T.title} intro={<p>{T.intro}</p>} meta={<p>{T.deviceOnlyText}</p>} />
      <FavoritesClient sourceNames={names} />
    </div>
  );
}
