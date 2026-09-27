import type { Metadata } from "next";
import { NotFoundState } from "@/components";
import { SYSTEM } from "@/content/pt-BR/system";

/** 404 dentro do portal (notFound() de matéria, editoria, assunto…): busca e caminhos (P25). */
export const metadata: Metadata = { title: SYSTEM.notFoundMeta, robots: { index: false } };

export default function NotFound() {
  return <NotFoundState />;
}
