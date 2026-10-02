import type { Metadata } from "next";
import { NotFoundState, PublicShell } from "@/components";
import { SYSTEM } from "@/content/pt-BR/system";

/** 404 de URL que não casa com nenhuma rota: mesma moldura do portal (P25). */
export const metadata: Metadata = { title: SYSTEM.notFoundMeta, robots: { index: false } };

export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundState />
    </PublicShell>
  );
}
