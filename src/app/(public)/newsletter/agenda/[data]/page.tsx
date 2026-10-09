import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { notFound } from "next/navigation";
import { Button, EmptyState } from "@/components";
import { NEWSLETTER_EDITION as T } from "@/content/pt-BR/newsletter";
import { getPublicEdition } from "@/lib/db/newsletter-editions";
import { AGENDA_LIST, rangeLabel, rangeOfEdition } from "@/lib/newsletter/agenda-edition";
import { pageMetadata } from "@/lib/seo/metadata";
import { EditionView } from "./EditionView";

/**
 * Edição da newsletter "Agenda do fim de semana" na web (ARD-T5, spec §6). Dados em cache por
 * 5 min (tag `newsletter`, revalidada pelo job). Data inválida, edição inexistente ou em
 * rascunho: 404 (a RLS só devolve edição publicada). Sem `loading.tsx`: com ele a resposta
 * começa em streaming e o 404 vira 200 (como no grupo `(inicio)`).
 */
export const revalidate = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = { params: Promise<{ data: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data } = await params;
  if (!DATE.test(data)) return {};
  const r = await getPublicEdition(AGENDA_LIST, data);
  if (!r.ok || !r.value) return {};
  const range = rangeLabel(rangeOfEdition(r.value.editionDate));
  return pageMetadata({
    title: r.value.subject,
    documentTitle: T.metaTitle(range),
    description: T.metaDescription(range),
    path: `/newsletter/agenda/${r.value.editionDate}`,
  });
}

export default async function AgendaEditionRoute({ params }: Props) {
  const { data } = await params;
  if (!DATE.test(data)) notFound();
  const r = await getPublicEdition(AGENDA_LIST, data);
  if (!r.ok) {
    if (r.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Edição indisponível: ${r.error.message}`);
    }
    return (
      <div className="mx-auto w-full max-w-read px-gutter py-10">
        <EmptyState
          as="h1"
          tone="error"
          title={T.errorTitle}
          actions={
            <Button href="/newsletter" size="md" variant="outline">
              {T.backNewsletter}
            </Button>
          }
        >
          <p>{T.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!r.value || r.value.items.length === 0) notFound();
  return <EditionView edition={r.value} />;
}
