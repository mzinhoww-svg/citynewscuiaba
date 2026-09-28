import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage, PrivacyPreferences } from "@/components";
import { PRIVACY as DOC } from "@/content/pt-BR/institutional";
import { RECS_PAGE_TEXT } from "@/content/pt-BR/privacy";

/** Privacidade (P22/P24): texto fixo, sem banco, e as preferências de consentimento (P2). */
export const metadata: Metadata = pageMetadata({
  title: DOC.title,
  documentTitle: DOC.metaTitle,
  description: DOC.description,
  path: DOC.path,
});

export default function Page() {
  return (
    <DocPage title={DOC.title} intro={DOC.intro} sections={DOC.sections} path={DOC.path}>
      <PrivacyPreferences />
      <p className="max-w-read type-body">
        <Link
          href="/privacidade/recomendacoes"
          className="font-semibold text-link underline underline-offset-4"
        >
          {RECS_PAGE_TEXT.title}
        </Link>
      </p>
    </DocPage>
  );
}
