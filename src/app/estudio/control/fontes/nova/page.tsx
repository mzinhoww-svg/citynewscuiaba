import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components";
import { AddSourceWizard } from "@/components/estudio";
import { WIZARD_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href={BASE}
          className="inline-flex items-center gap-1 type-meta text-link no-underline hover:underline"
        >
          <Icon name="arrow-left" size={16} />
          {T.back}
        </Link>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="max-w-read type-body text-meta">{T.description}</p>
      </header>
      <AddSourceWizard
        analyze={analyzeLinkAction}
        create={createSourceAction}
        sections={sections}
        defaultFrequency={defaultFrequency}
        basePath={BASE}
        initialUrl={initialUrl}
      />
    </section>
  );
}
