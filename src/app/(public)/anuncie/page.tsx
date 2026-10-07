import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { Benefits, Cta, DocBreadcrumb, DocRelated, Faq, Hero } from "@/components";
import {
  ADVERTISE as DOC,
  ADVERTISE_PAGE as P,
  DOC_TEXT,
  isFilled,
} from "@/content/pt-BR/institutional";
import { MARKETING } from "@/content/pt-BR/site";

/**
 * Página institucional (P24): texto fixo, sem banco. UI-T11: hero, regras fixas (benefícios),
 * contato comercial (CTA) e FAQ, em blocos de marketing. Sem números de audiência nem clientes.
 */
export const metadata: Metadata = pageMetadata({
  title: DOC.title,
  documentTitle: DOC.metaTitle,
  description: DOC.description,
  path: DOC.path,
});

const [RULES, CONTACT] = DOC.sections;

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-10 px-gutter py-8 lg:gap-14 lg:py-12">
      <DocBreadcrumb title={DOC.title} />
      <Hero
        id="anuncie-titulo"
        title={DOC.title}
        intro={DOC.intro}
        action={{ label: P.heroCta, href: "#anuncie-contato", icon: "arrow-down" }}
      />
      <Benefits
        id="anuncie-regras"
        title={RULES?.title ?? ""}
        intro={P.rulesIntro}
        items={P.rules}
      />
      <Cta
        id="anuncie-contato"
        className="scroll-mt-6"
        title={CONTACT?.title ?? ""}
        text={P.contactText}
        action={{ label: P.cta, href: P.ctaHref, icon: "mail" }}
      >
        <ul className="flex flex-col gap-1 type-body text-body">
          {(CONTACT?.items ?? []).filter(isFilled).map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </Cta>
      <Faq id="anuncie-faq" title={MARKETING.faqTitle} items={P.faq} />
      <p className="type-meta text-meta">{DOC_TEXT.updated}</p>
      <DocRelated path={DOC.path} />
    </div>
  );
}
