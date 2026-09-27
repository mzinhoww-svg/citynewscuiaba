import type { Metadata } from "next";
import { DocPage } from "@/components";
import { CONTACT as DOC } from "@/content/pt-BR/institutional";

/** Página institucional (P24): texto fixo, sem banco. */
export const metadata: Metadata = {
  title: DOC.metaTitle,
  description: DOC.description,
  alternates: { canonical: DOC.path },
};

export default function Page() {
  return <DocPage title={DOC.title} intro={DOC.intro} sections={DOC.sections} path={DOC.path} />;
}
