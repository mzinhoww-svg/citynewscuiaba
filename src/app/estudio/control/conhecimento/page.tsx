import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Table } from "@/components";
import { StudioScreen } from "@/components/estudio";
import { AI_TEXT, formatInt, formatPct } from "@/content/pt-BR/ai-control";
import { requireRole } from "@/lib/auth/require-role";
import { canAccess } from "@/lib/auth";
import { knowledgeBases } from "@/lib/db/queries/ai-control";
import { formatDateTime } from "@/lib/format/date";
import { NEIGHBORHOODS } from "@/lib/geo";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = {
  title: "Bases de conhecimento · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const T = AI_TEXT.knowledge;

export default async function KnowledgePage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/conhecimento",
  });
  const data = await loadOrNull("ai knowledge", () => knowledgeBases());
  const share = (n: number, total: number) => (total > 0 ? formatPct(n / total) : AI_TEXT.none);

  return (
    <StudioScreen section={AI_TEXT.sectionLabel} title={T.title} intro={T.intro} gap="lg">
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={AI_TEXT.errorTitle}
          actions={
            <Button href="/estudio/control/conhecimento" size="md" variant="outline">
              {AI_TEXT.retry}
            </Button>
          }
        >
          {AI_TEXT.errorBody}
        </EmptyState>
      ) : data.value.length === 0 ? (
        <EmptyState icon="database" title={T.empty} />
      ) : (
        <>
          <Table
            caption={T.caption}
            minWidth="lg"
            headers={[
              T.col.base,
              T.col.use,
              { label: T.col.total, align: "right" },
              { label: T.col.indexed, align: "right" },
              { label: T.col.embedded, align: "right" },
              T.col.updated,
            ]}
          >
            {data.value.map((b) => {
              const info = T.bases[b.base] ?? { name: b.base, use: "" };
              const vectors =
                b.base === "articles" || b.base === "aggregated" || b.base === "topics";
              return (
                <tr key={b.base} className="border-b border-line-subtle last:border-b-0">
                  <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                    {info.name}
                  </th>
                  <td className="px-3 py-3 type-meta text-body">{info.use}</td>
                  <td className="px-3 py-3 text-right type-body tabular-nums">
                    {formatInt(b.total)}
                  </td>
                  <td className="px-3 py-3 text-right type-body tabular-nums">
                    {b.base === "sources"
                      ? `${formatInt(b.indexed)} ${T.activeSources}`
                      : share(b.indexed, b.total)}
                  </td>
                  <td className="px-3 py-3 text-right type-body tabular-nums">
                    {vectors ? share(b.embedded, b.total) : T.notApplicable}
                  </td>
                  <td className="px-3 py-3 type-body tabular-nums">
                    {b.updatedAt ? formatDateTime(b.updatedAt) : AI_TEXT.none}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="type-meta text-meta">{T.pendingNote}</p>
          <section aria-labelledby="dicionario" className="flex flex-col gap-2">
            <h2 id="dicionario" className="type-section text-strong">
              {T.dictionaryTitle}
            </h2>
            <p className="type-body text-body">{T.dictionaryText(NEIGHBORHOODS.length)}</p>
          </section>
          {canAccess(session.roles, "audit.view") && (
            <Link
              href="/estudio/control/logs?etapa=index"
              className="type-body font-medium text-link underline-offset-4 hover:underline"
            >
              {T.logsLink}
            </Link>
          )}
        </>
      )}
    </StudioScreen>
  );
}
