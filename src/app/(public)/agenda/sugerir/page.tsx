import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { EventSuggestionForm } from "@/components";
import { AGENDA, SUGGEST } from "@/content/pt-BR/portal";
import { suggestEventAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: SUGGEST.metaTitle,
  documentTitle: SUGGEST.metaTitle,
  description: SUGGEST.intro,
  path: "/agenda/sugerir",
});

/** Sugerir evento (P11): página estática; o envio é uma Server Action. */
export default function SuggestEventRoute() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-8 lg:py-10">
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-5">
        <p className="type-eyebrow text-eyebrow">{AGENDA.eyebrow}</p>
        <h1 className="type-display text-strong">{SUGGEST.title}</h1>
        <p className="type-body text-body">{SUGGEST.intro}</p>
      </header>
      <div className="max-w-read">
        <EventSuggestionForm action={suggestEventAction} />
      </div>
    </div>
  );
}
