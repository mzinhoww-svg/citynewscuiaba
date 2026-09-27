import type { Metadata } from "next";
import { ALERTS_TEXT as T } from "@/content/pt-BR/alerts";
import { SECTIONS } from "@/content/pt-BR/nav";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { listTopics } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo/metadata";
import { AlertsClient } from "./AlertsClient";

/** Alertas (P18): navegador sem conta; e-mail com confirmação por link (fila, B-005). */
export const metadata: Metadata = {
  ...pageMetadata({
    title: T.title,
    documentTitle: T.metaTitle,
    description: T.metaDescription,
    path: "/alertas",
  }),
  robots: { index: false, follow: true },
};

export default async function AlertsRoute() {
  const topics = await listTopics();
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-gutter py-8 lg:py-10">
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-5">
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
        <p className="type-meta text-meta">{T.limits}</p>
      </header>
      <AlertsClient
        targets={{
          bairro: NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name })),
          tema: SECTIONS.map((s) => ({ value: s.id, label: s.label })),
          assunto: topics.ok ? topics.value.map((t) => ({ value: t.slug, label: t.title })) : [],
        }}
      />
    </div>
  );
}
