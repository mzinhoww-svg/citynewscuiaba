import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { Benefits, Cta, DocBreadcrumb, DocRelated, Faq, Hero } from "@/components";
import { ABOUT as DOC, ABOUT_PAGE as P, DOC_TEXT, isFilled } from "@/content/pt-BR/institutional";
import { MARKETING } from "@/content/pt-BR/site";

/**
 * Página institucional (P24): texto fixo, sem banco. UI-T11: hero, o que você encontra
 * (benefícios), como trabalhamos (CTA), quem somos e FAQ, em blocos de marketing.
 */
export const metadata: Metadata = pageMetadata({
  title: DOC.title,
  documentTitle: DOC.metaTitle,
  description: DOC.description,
  path: DOC.path,
});

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-10 px-gutter py-8 lg:gap-14 lg:py-12">
      <DocBreadcrumb title={DOC.title} />
      <Hero id="sobre-titulo" title={DOC.title} intro={DOC.intro} />
      <Benefits id="sobre-oferta" title={P.offerTitle} items={P.offer} />
      <Cta id="sobre-como" title={P.howTitle} action={{ label: P.howCta, href: P.howHref }}>
        <div className="flex max-w-read flex-col gap-3">
          {P.how.map((p) => (
            <p key={p} className="type-body text-pretty text-body">
              {p}
            </p>
          ))}
        </div>
      </Cta>
      <section aria-labelledby="sobre-quem" className="flex max-w-read flex-col gap-3">
        <h2 id="sobre-quem" className="type-section text-strong">
          {P.whoTitle}
        </h2>
        <ul className="flex flex-col gap-2 type-body text-body">
          {P.who.filter(isFilled).map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </section>
      <Faq id="sobre-faq" title={MARKETING.faqTitle} items={P.faq} />
      <p className="type-meta text-meta">{DOC_TEXT.updated}</p>
      <DocRelated path={DOC.path} />
    </div>
  );
}
