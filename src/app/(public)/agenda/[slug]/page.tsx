import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { notFound } from "next/navigation";
import { Button, EmptyState } from "@/components";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { getEvent, listEvents } from "@/lib/db/queries";
import { EventDetail } from "./EventDetail";

/** Evento (P10): dados em cache por 5 min (HTML por requisição por causa do nonce da CSP, A-038). */
export const revalidate = 300;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return {};
  const r = await getEvent(slug);
  if (!r.ok || !r.value) return {};
  return pageMetadata({
    title: r.value.title,
    documentTitle: `${r.value.title} · ${AGENDA.metaTitle}`,
    description: r.value.description ?? undefined,
    path: r.value.href,
  });
}

export default async function EventRoute({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const r = await getEvent(slug);
  if (!r.ok) {
    if (r.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Evento indisponível: ${r.error.message}`);
    }
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={AGENDA.eventError}
          actions={
            <Button href="/agenda" size="md" variant="outline">
              {AGENDA.backAgenda}
            </Button>
          }
        >
          <p>{AGENDA.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!r.value) notFound();
  const related = await listEvents({ category: r.value.category, excludeId: r.value.id, limit: 3 });
  return <EventDetail e={r.value} related={related.ok ? related.value : []} />;
}
