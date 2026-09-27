import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage, RightOfReplyForm } from "@/components";
import { REPLY } from "@/content/pt-BR/institutional";
import { rightOfReplyAction } from "./actions";

/** Direito de resposta (P24): formulário sem login → fila de denúncias do Estúdio (E14). */
export const metadata: Metadata = pageMetadata({
  title: REPLY.title,
  documentTitle: REPLY.metaTitle,
  description: REPLY.metaDescription,
  path: "/direito-de-resposta",
});

export default function RightOfReplyPage() {
  return (
    <DocPage
      title={REPLY.title}
      intro={REPLY.intro}
      sections={[{ title: REPLY.lawTitle, paragraphs: [REPLY.lawNote] }]}
      path="/direito-de-resposta"
    >
      <RightOfReplyForm action={rightOfReplyAction} />
    </DocPage>
  );
}
