import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";

export const metadata: Metadata = {
  title: "Fonte não encontrada · Control Center · CityNews Cuiabá",
};

/** 404 amigável para id inexistente (spec §8, O04). */
export default function NotFound() {
  return (
    <EmptyState
      as="h1"
      title={DETAIL_TEXT.notFound.title}
      actions={<Button href="/estudio/control/fontes">{DETAIL_TEXT.notFound.back}</Button>}
    >
      <p>{DETAIL_TEXT.notFound.body}</p>
    </EmptyState>
  );
}
