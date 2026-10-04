import type { Metadata } from "next";
import { PAGE_CONTAINER, PageHeader } from "@/components";
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
    <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <PageHeader title={T.title} intro={<p>{T.intro}</p>} meta={<p>{T.limits}</p>} />
      <AlertsClient
        targets={{
          bairro: NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name })),
          tema: SECTIONS.map((s) => ({ value: s.id, label: s.label })),
          assunto: topics.ok ? topics.value.map((t) => ({ value: t.slug, label: t.title })) : [],
        }}
        topicsError={!topics.ok}
      />
    </div>
  );
}
