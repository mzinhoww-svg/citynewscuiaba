import type { Metadata } from "next";
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
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-gutter py-8 lg:py-10">
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-5">
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
      </header>
      <FavoritesClient sourceNames={names} />
    </div>
  );
}
