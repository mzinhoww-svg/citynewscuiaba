import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage, PrivacyPreferences } from "@/components";
import { PRIVACY as DOC } from "@/content/pt-BR/institutional";

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
    </DocPage>
  );
}
