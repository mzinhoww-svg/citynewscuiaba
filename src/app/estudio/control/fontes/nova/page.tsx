import type { Metadata } from "next";
import { AddSourceWizard, StudioScreen } from "@/components/estudio";
import { WIZARD_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { createServerClient } from "@/lib/db/client";
import { many } from "@/lib/db/queries/run";
import { analyzeLinkAction, createSourceAction } from "../actions";

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
      intro={T.description}
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
