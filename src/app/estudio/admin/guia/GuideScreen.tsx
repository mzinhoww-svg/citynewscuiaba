import Link from "next/link";
import type { ReactNode } from "react";
import { GUIDE_ADMIN_TEXT as T } from "@/content/pt-BR/guide";
import { formatWhen } from "@/lib/format/date";
import type { GuideStatus } from "@/lib/db/queries/guide-admin";
import { AdminScreen } from "../screen";

export type GuideTab = "propostas" | "listas" | "lugares" | "modelos";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "propostas", label: T.tabs.proposals },
  { id: "listas", label: T.tabs.lists },
  { id: "lugares", label: T.tabs.venues },
  { id: "modelos", label: T.tabs.templates },
];

/** Moldura do admin do Guia: abas, estado das fontes de dados e a tela da aba. */
export function GuideScreen({
  active,
  status,
  failed,
  children,
}: {
  active: GuideTab;
  status: GuideStatus | null;
  failed: boolean;
  children: ReactNode;
}) {
  return (
    <AdminScreen
      title={T.title}
      intro={T.intro}
      retryHref={`/estudio/admin/guia/${active}`}
      failed={failed}
    >
      <nav aria-label={T.tabs.label}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`/estudio/admin/guia/${t.id}`}
                aria-current={t.id === active ? "page" : undefined}
                className={
                  t.id === active
                    ? "inline-flex h-chip items-center rounded-pill bg-action-primary px-4.5 text-14 font-semibold text-on-inverse no-underline"
                    : "inline-flex h-chip items-center rounded-pill bg-section px-4.5 text-14 text-meta no-underline hover:bg-hover hover:text-strong"
                }
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {status && (
        <section
          aria-label={T.status.title}
          className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
        >
          <p className="type-meta font-semibold text-strong">{T.status.title}</p>
          <p className="type-meta text-meta">
            {status.tripadvisorKey ? T.status.tripadvisorOn : T.status.tripadvisorOff}
          </p>
          <p className="type-meta text-meta">
            {status.autoPublish ? T.status.autoOn : T.status.autoOff}
          </p>
          <p className="type-meta text-meta">
            {T.status.lastSync(status.lastSync ? formatWhen(status.lastSync) : null)}
          </p>
          <p className="type-meta text-meta">
            {T.status.lastPropose(status.lastPropose ? formatWhen(status.lastPropose) : null)}
          </p>
          <p className="type-meta text-meta">
            {T.status.counts(status.openProposals, status.publishedLists, status.venues)}
          </p>
        </section>
      )}
      {children}
    </AdminScreen>
  );
}
