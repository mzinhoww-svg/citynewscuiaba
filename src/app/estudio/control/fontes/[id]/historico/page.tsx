import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, EmptyState, SourceAuditTable } from "@/components";
import { DETAIL_TEXT, HISTORY_TAB_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { sourceHistory } from "@/lib/db/queries/sources-admin";
import { detailPath, loadSource } from "../detail";

export const metadata: Metadata = {
  title: "Histórico da fonte · Control Center · CityNews Cuiabá",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Aba Histórico (spec §8): auditoria da fonte com filtro por tipo e exportação. */
export default async function SourceHistoryPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  const tipo = typeof sp.tipo === "string" && sp.tipo in HISTORY_TAB_TEXT.actions ? sp.tipo : "";
  const pagina = typeof sp.pagina === "string" && /^\d+$/.test(sp.pagina) ? Number(sp.pagina) : 1;
  const history = await sourceHistory(d.id, pagina, tipo || undefined);
  const basePath = detailPath(d.id, "/historico");
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-section text-strong">{HISTORY_TAB_TEXT.title}</h2>
      {!history.ok ? (
        <EmptyState
          tone="error"
          title={DETAIL_TEXT.error.tab}
          actions={<Button href={basePath}>{DETAIL_TEXT.error.retry}</Button>}
        />
      ) : (
        <SourceAuditTable
          rows={history.value.rows}
          total={history.value.total}
          page={history.value.page}
          basePath={basePath}
          filter={tipo}
          slug={d.slug}
        />
      )}
    </section>
  );
}
