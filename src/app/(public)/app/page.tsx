import type { Metadata } from "next";
import { Benefits, Faq, Hero } from "@/components";
import { APP_PAGE_TEXT as T } from "@/content/pt-BR/app";
import { MARKETING } from "@/content/pt-BR/site";
import { pageMetadata } from "@/lib/seo/metadata";
import { InstallButton } from "./InstallButton";

/**
 * P26 · Baixar o app (spec 2026-09-28 §7.9): instruções por plataforma, sem banco. UI-T11: hero
 * com o botão de instalar, benefícios, passo a passo e FAQ em blocos de marketing.
 */
export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.description,
  path: "/app",
});

const WHY = T.why.map((text, i) => ({ text, ...T.whyItems[i] }));

export default function Page() {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-10 px-gutter py-8 lg:gap-14 lg:py-12">
      <Hero id="app-titulo" title={T.title} intro={T.intro}>
        <InstallButton />
      </Hero>
      <Benefits id="app-porque" title={T.whyTitle} items={WHY} />
      <section aria-labelledby="app-como" className="flex flex-col gap-6">
        <h2 id="app-como" className="type-section text-strong">
          {T.howTo}
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {T.platforms.map((p) => (
            <section
              key={p.id}
              aria-labelledby={`app-${p.id}`}
              className="flex flex-col gap-2 border-t border-line-subtle pt-4"
            >
              <h3 id={`app-${p.id}`} className="type-headline-sm text-strong">
                {p.title}
              </h3>
              {p.steps.length > 1 ? (
                <ol className="flex list-decimal flex-col gap-1 pl-5 type-body text-body">
                  {p.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              ) : (
                <p className="type-body text-body">{p.steps[0]}</p>
              )}
            </section>
          ))}
        </div>
      </section>
      <Faq id="app-faq" title={MARKETING.faqTitle} items={T.faq} />
    </div>
  );
}
