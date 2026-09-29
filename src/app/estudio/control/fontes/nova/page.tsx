import type { Metadata } from "next";
import { AddSourceWizard, Button, EmptyState } from "@/components";
import { WIZARD } from "@/content/pt-BR/sources-admin-detail";
import {
  analyzeLinkAction,
  createSourceAction,
  activateSourceAction,
  updateSourceAction,
} from "../actions";
import { loadFastLane, loadSections } from "../[id]/data";

export const metadata: Metadata = { title: "Adicionar fonte · Fontes · Estúdio · CityNews Cuiabá" };

export default async function NewSourcePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const data = await Promise.all([loadSections(), loadFastLane()]).catch(() => null);
  if (data) {
    const [sections, lane] = data;
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Button variant="text" size="md" icon="arrow-left" href="/estudio/control/fontes">
            Voltar para fontes
          </Button>
          <h1 className="type-screen-title text-strong">{WIZARD.title}</h1>
          <p className="type-body text-meta">{WIZARD.intro}</p>
        </header>
        <AddSourceWizard
          sections={sections}
          fastLane={lane}
          initialUrl={typeof url === "string" ? url.slice(0, 2048) : ""}
          analyze={analyzeLinkAction}
          create={createSourceAction}
          update={updateSourceAction}
          activate={activateSourceAction}
        />
      </section>
    );
  }
  {
    return (
      <EmptyState
        as="h1"
        tone="error"
        title="Não foi possível abrir o cadastro."
        actions={
          <Button size="md" variant="outline" href="/estudio/control/fontes/nova">
            Tentar de novo
          </Button>
        }
      >
        Nada foi alterado. Tente de novo em instantes.
      </EmptyState>
    );
  }
}
