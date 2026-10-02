import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage } from "@/components";
import { TERMS as DOC } from "@/content/pt-BR/institutional";

/** Página institucional (P24): texto fixo, sem banco. */
export const metadata: Metadata = pageMetadata({
  title: DOC.title,
  documentTitle: DOC.metaTitle,
  description: DOC.description,
  path: DOC.path,
});

export default function Page() {
  return <DocPage title={DOC.title} intro={DOC.intro} sections={DOC.sections} path={DOC.path} />;
}
