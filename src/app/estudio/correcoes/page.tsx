import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Table } from "@/components";
import { QueueTabs } from "@/components/estudio";
import { CORRECTIONS_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { requireRole } from "@/lib/auth/require-role";
import { listCorrectionQueue, type CorrectionRow } from "@/lib/db/queries/studio-corrections";
import { formatDateTime } from "@/lib/format/date";

export const metadata: Metadata = { title: "Correções · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("correction.manage", undefined, { next: "/estudio/correcoes" });
  const sp = await searchParams;
  const tab = sp.estado === "publicadas" ? "published" : "open";
  let rows: CorrectionRow[] | null = null;
  try {
    rows = await listCorrectionQueue(tab);
  } catch {
    rows = null;
  }
  const now = new Date().getTime();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <QueueTabs
        label={T.tabsLabel}
        current={tab}
        items={[
          { key: "open", label: T.tabs.open, href: "/estudio/correcoes" },
          {
            key: "published",
            label: T.tabs.published,
            href: "/estudio/correcoes?estado=publicadas",
          },
        ]}
      />
      {rows === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/correcoes" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="check">
          {T.empty[tab]}
        </EmptyState>
      ) : (
        <>
          {/* Celular (< md): cartões; a tabela aparece a partir de md. */}
          <ul aria-label={T.caption} className="flex flex-col gap-3 md:hidden">
            {rows.map((c) => {
              const overdue = tab === "open" && Date.parse(c.dueAt) < now;
              return (
                <li
                  key={c.id}
                  className="flex min-w-0 flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
                >
                  <Link
                    href={`/estudio/correcoes/${c.id}`}
                    className="type-body font-semibold text-strong underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                  >
                    {c.article.title}
                  </Link>
                  <p className="type-meta text-meta">
                    {T.kind[c.kind] ?? c.kind} · {T.col.requestedBy}: {c.requestedBy}
                  </p>
                  <p className="type-meta">
                    <span className="text-meta">
                      {tab === "open" ? T.col.due : T.publishedAt}:{" "}
                    </span>
                    <DueDate correction={c} tab={tab} overdue={overdue} />
                  </p>
                  <p className="type-meta text-strong">
                    {T.status[c.status] ?? c.status}
                    {tab === "published" && (
                      <span className="block text-meta">{T.notified(c.notified)}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <Table
            caption={T.caption}
            minWidth="md"
            className="hidden md:block"
            headers={[
              T.col.article,
              T.col.kind,
              T.col.requestedBy,
              tab === "open" ? T.col.due : T.publishedAt,
              T.col.status,
            ]}
          >
            {rows.map((c) => {
              const overdue = tab === "open" && Date.parse(c.dueAt) < now;
              return (
                <tr key={c.id} className="border-b border-line-subtle align-top last:border-b-0">
                  <th scope="row" className="px-3 py-3 font-normal">
                    <Link
                      href={`/estudio/correcoes/${c.id}`}
                      className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                    >
                      {c.article.title}
                    </Link>
                  </th>
                  <td className="px-3 py-3 type-body">{T.kind[c.kind] ?? c.kind}</td>
                  <td className="px-3 py-3 type-body">{c.requestedBy}</td>
                  <td className="px-3 py-3 type-body tabular-nums">
                    <DueDate correction={c} tab={tab} overdue={overdue} />
                  </td>
                  <td className="px-3 py-3 type-body">
                    {T.status[c.status] ?? c.status}
                    {tab === "published" && (
                      <span className="block type-meta text-meta">{T.notified(c.notified)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </section>
  );
}

/** Prazo (aberta) ou data de publicação; prazo vencido em destaque, com texto para leitor de tela. */
function DueDate({
  correction: c,
  tab,
  overdue,
}: {
  correction: CorrectionRow;
  tab: "open" | "published";
  overdue: boolean;
}) {
  return (
    <span
      className={overdue ? "font-semibold text-danger tabular-nums" : "text-strong tabular-nums"}
    >
      {overdue && <span className="sr-only">{T.overdue}: </span>}
      {formatDateTime(tab === "open" ? c.dueAt : (c.publishedAt ?? c.dueAt))}
    </span>
  );
}
