import type { Metadata } from "next";
import { RecommendationControls } from "@/components";
import { RECS_PAGE_TEXT as T } from "@/content/pt-BR/privacy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.intro,
  path: "/privacidade/recomendacoes",
});

/** Como usamos suas recomendações (P21): controles do leitor, sem conta e sem banco. */
export default function RecommendationsPrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-read flex-col gap-8 px-gutter py-8 lg:py-10">
      <header className="flex flex-col gap-3 border-b-2 border-line-strong pb-5">
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
      </header>
      <RecommendationControls />
    </div>
  );
}
