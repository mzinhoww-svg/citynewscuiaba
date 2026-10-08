import type { Metadata } from "next";
import Link from "next/link";
import { AddSourceWizard, EventSourceForm, StudioScreen } from "@/components/estudio";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { EVENT_FORM_TEXT as EV } from "@/content/pt-BR/sources-admin-events";
import { WIZARD_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { createServerClient } from "@/lib/db/client";
import { many } from "@/lib/db/queries/run";
import {
  analyzeEventLinkAction,
  analyzeLinkAction,
  createEventSourceAction,
  createSourceAction,
} from "../actions";

export const metadata: Metadata = { title: "Nova fonte · Control Center · CityNews Cuiabá" };

const BASE = "/estudio/control/fontes";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * O04a · Nova fonte (spec §7.1, §8): assistente em 5 passos. Editorias e padrão global lidos aqui;
 * a análise e o cadastro são Server Actions de FS-T6. `?url=` (vindo de "Reanalisar link") só
 * preenche o campo: nada é analisado sem o clique.
 */
export default async function NewSourcePage({ searchParams }: Props) {
  const sp = await searchParams;
  const initialUrl = typeof sp.url === "string" ? sp.url.slice(0, 2048) : "";
  // `?tipo=eventos` (AGM-T6): cadastro de fonte de eventos da Agenda.
  if (sp.tipo === "eventos")
    return (
      <StudioScreen
        title={EV.title}
        intro={
          <>
            <p className="max-w-read type-body text-meta">{EV.description}</p>
            <Link
              href={`${BASE}/nova`}
              className="w-fit type-body text-link underline-offset-4 hover:underline"
            >
              {EV.newsLink}
            </Link>
          </>
        }
        breadcrumbs={[
          { href: "/estudio/control", label: STUDIO_TEXT.sections.control },
          { href: BASE, label: T.back },
          { href: `${BASE}/nova?tipo=eventos`, label: EV.title },
        ]}
      >
        <EventSourceForm
          mode="create"
          analyze={analyzeEventLinkAction}
          save={createEventSourceAction}
          categories={AGENDA.categories}
          basePath={BASE}
          initialUrl={initialUrl}
        />
      </StudioScreen>
    );
  const db = await createServerClient();
  const [sections, settings] = await Promise.all([
    db.from("sections").select("slug, name").order("name").then(many),
    db
      .from("app_settings")
      .select("key, value")
      .eq("key", "sources.default_frequency_minutes")
      .then(many),
  ]);
  const value = settings[0]?.value;
  const defaultFrequency = typeof value === "number" ? value : 30;

  return (
    <StudioScreen
      title={T.title}
      intro={
        <>
          <p className="max-w-read type-body text-meta">{T.description}</p>
          <Link
            href={`${BASE}/nova?tipo=eventos`}
            className="w-fit type-body text-link underline-offset-4 hover:underline"
          >
            {EV.eventsLink}
          </Link>
        </>
      }
      breadcrumbs={[
        { href: "/estudio/control", label: STUDIO_TEXT.sections.control },
        { href: BASE, label: T.back },
        { href: `${BASE}/nova`, label: T.title },
      ]}
    >
      <AddSourceWizard
        analyze={analyzeLinkAction}
        create={createSourceAction}
        sections={sections}
        defaultFrequency={defaultFrequency}
        basePath={BASE}
        initialUrl={initialUrl}
      />
    </StudioScreen>
  );
}
