import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage } from "@/components";
import { AI_USE as DOC } from "@/content/pt-BR/institutional";

/** Página institucional (P24): texto fixo, sem banco. */
export const metadata: Metadata = pageMetadata({
  title: DOC.title,
  documentTitle: DOC.metaTitle,
  description: DOC.description,
  path: DOC.path,
});

export default function Page() {
  /* R34: oculta do público; abre só com CN_SHOW_LEGAL_PAGES=1 (código mantido). */
  if (process.env.CN_SHOW_LEGAL_PAGES !== "1") notFound();
  return <DocPage title={DOC.title} intro={DOC.intro} sections={DOC.sections} path={DOC.path} />;
}
