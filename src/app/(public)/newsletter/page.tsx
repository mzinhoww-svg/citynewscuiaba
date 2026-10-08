import type { Metadata } from "next";
import Link from "next/link";
import { Cta, Faq, Hero, NewsletterForm } from "@/components";
import { NEWSLETTER_LISTS, NEWSLETTER_PAGE as T } from "@/content/pt-BR/newsletter";
import { getHomeData, listEvents, listSection } from "@/lib/db/queries";
import { formatDayMonth, formatHour } from "@/lib/format/date";
import { MARKETING } from "@/content/pt-BR/site";
import { pageMetadata } from "@/lib/seo/metadata";
import { subscribeListsAction } from "./actions";

/**
 * Newsletter (P19): listas com amostra da última edição e inscrição só com e-mail. UI-T11: hero,
 * lista, CTA de inscrição e FAQ em blocos de marketing.
 */
export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.metaDescription,
  path: "/newsletter",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Sample = { title: string; href: string; meta?: string }[];

async function samples(): Promise<Record<string, Sample>> {
  const [home, events, politics] = await Promise.all([
    getHomeData(new Date(), { cache: true }),
    listEvents({ limit: 3 }),
    listSection("politica"),
  ]);
  const articles = home.ok ? [home.value.lead, ...home.value.now].filter((a) => a !== null) : [];
  return {
    diaria: articles.slice(0, 3).map((a) => ({ title: a.title, href: a.href })),
    "agenda-fds": events.ok
      ? events.value.map((e) => ({
          title: e.title,
          href: e.href,
          meta: `${formatDayMonth(e.startsAt)}, ${formatHour(e.startsAt)}`,
        }))
      : [],
    "politica-semana":
      politics.ok && politics.value
        ? politics.value.articles.slice(0, 3).map((a) => ({ title: a.title, href: a.href }))
        : [],
  };
}

export default async function NewsletterRoute() {
  const sample = await samples();
  return (
    <div className={`${CONTAINER} flex flex-col gap-10 py-8 lg:py-10`}>
      <Hero
        id="newsletter-titulo"
        title={T.title}
        intro={T.intro}
        action={{ label: T.heroCta, href: "#inscrever", icon: "arrow-down" }}
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14">
        <ul aria-label={T.listsTitle} className="flex flex-col gap-6">
          {NEWSLETTER_LISTS.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-3 border-t-2 border-line-strong pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-col gap-1">
                <h2 className="type-section text-strong">{l.name}</h2>
                <p className="type-meta font-semibold text-meta">{l.when}</p>
                <p className="type-body text-body">{l.description}</p>
              </div>
              <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                <h3 className="type-eyebrow text-meta">{T.sample}</h3>
                {(sample[l.id] ?? []).length === 0 ? (
                  <p className="type-meta text-meta">{T.sampleEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(sample[l.id] ?? []).map((s) => (
                      <li key={s.href} className="type-body">
                        <Link
                          href={s.href}
                          className="text-strong underline-offset-4 hover:underline"
                        >
                          {s.title}
                        </Link>
                        {s.meta && <span className="type-meta text-meta"> · {s.meta}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Cta
          id="inscrever"
          title={T.submit}
          className="scroll-mt-6 self-start lg:sticky lg:top-sticky-public"
        >
          <NewsletterForm
            action={subscribeListsAction}
            lists={NEWSLETTER_LISTS.map((l) => ({ id: l.id, name: l.name, when: l.when }))}
          />
        </Cta>
      </div>
      <Faq id="newsletter-faq" title={MARKETING.faqTitle} items={T.faq} />
    </div>
  );
}
