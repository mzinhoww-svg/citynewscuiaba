import Link from "next/link";
import { Button, Cta } from "@/components";
import { NEWSLETTER_EDITION as T } from "@/content/pt-BR/newsletter";
import type { PublicEdition } from "@/lib/db/newsletter-editions";
import { groupEditionItems, rangeLabel, rangeOfEdition } from "@/lib/newsletter/agenda-edition";

const CONTAINER = "mx-auto w-full max-w-read px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Página web de uma edição da "Agenda do fim de semana" (ARD-T5, spec §6): os itens gravados
 * (dado, nunca o HTML do e-mail), por dia, com link para a página de cada evento na Agenda.
 */
export function EditionView({ edition }: { edition: PublicEdition }) {
  const range = rangeLabel(rangeOfEdition(edition.editionDate));
  const days = groupEditionItems(edition.items);
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow text-eyebrow">{T.eyebrow}</p>
        <h1 className="type-display text-strong">{T.name}</h1>
        <p className="type-headline-md text-strong">{range}</p>
        <p className="type-body text-pretty text-body">{T.intro}</p>
      </header>
      {days.map((d) => (
        <section key={d.day} aria-labelledby={`dia-${d.day}`} className="flex flex-col gap-1">
          <h2 id={`dia-${d.day}`} className="type-section text-strong">
            {d.dayLabel}
          </h2>
          <ul className="flex flex-col">
            {d.items.map((i) => (
              <li
                key={i.slug}
                className="flex flex-col gap-1 border-t border-line-subtle py-4 first:border-t-0"
              >
                <h3 className="type-headline-md text-strong">
                  <Link
                    href={SLUG.test(i.slug) ? `/agenda/${i.slug}` : "/agenda"}
                    className="underline-offset-4 hover:underline"
                  >
                    {i.title}
                  </Link>
                </h3>
                <p className="type-meta text-meta">
                  {i.when} · {i.where}
                </p>
                <p className="type-meta font-semibold text-strong">{i.price}</p>
                {i.origin && <p className="type-meta text-meta">{i.origin}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="type-body font-semibold text-strong">{T.checkSource}</p>
      <div>
        <Button href="/agenda" variant="outline" size="md">
          {T.fullAgenda}
        </Button>
      </div>
      <Cta
        id="edicao-inscrever"
        title={T.subscribeTitle}
        text={T.subscribeText}
        action={{ label: T.subscribe, href: "/newsletter#inscrever" }}
      />
    </div>
  );
}
