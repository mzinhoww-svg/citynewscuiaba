import type { Metadata } from "next";
import { Button, cx, EmptyState } from "@/components";
import { StaffUrgentOptIn, StudioScreen } from "@/components/estudio";
import {
  KIND_TEXT,
  NOTIFICATIONS_PAGE_TEXT as T,
  SEVERITY_BADGE,
} from "@/content/pt-BR/studio-notifications";
import { getSession } from "@/lib/auth/require-role";
import { listHistory, staffAlertsOn } from "@/lib/db/queries/studio-notifications";
import { formatDateTime } from "@/lib/format/date";
import { markAllReadAction, markReadAction, setStaffAlertsAction } from "./actions";

export const metadata: Metadata = { title: "Notificações da equipe · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Search = { tipo?: string; situacao?: string; antes?: string };

const SEVERITY_STYLE = {
  urgent: "bg-erro-soft text-danger",
  warn: "bg-atencao-soft text-warn",
  info: "bg-section text-meta",
} as const;

function href(base: Search, patch: Search): string {
  const merged = { ...base, ...patch };
  const q = new URLSearchParams();
  if (merged.tipo) q.set("tipo", merged.tipo);
  if (merged.situacao) q.set("situacao", merged.situacao);
  if (merged.antes) q.set("antes", merged.antes);
  const s = q.toString();
  return s ? `/estudio/notificacoes?${s}` : "/estudio/notificacoes";
}

/** Central de notificações da equipe: histórico completo com filtros por tipo e situação. */
export default async function NotificationsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Search> }>) {
  const session = await getSession();
  if (!session) return null;
  const sp = await searchParams;
  const kind = sp.tipo && sp.tipo in KIND_TEXT ? sp.tipo : undefined;
  const onlyUnread = sp.situacao === "nao-lidas";
  const cursor = sp.antes && !Number.isNaN(Date.parse(sp.antes)) ? sp.antes : undefined;
  const [page, urgentOn] = await Promise.all([
    listHistory({ kind, onlyUnread, cursor }),
    staffAlertsOn(session.userId),
  ]);
  const base: Search = { tipo: kind, situacao: onlyUnread ? "nao-lidas" : undefined };

  return (
    <StudioScreen title={T.title} intro={T.intro}>
      <nav aria-label={T.filterStatus} className="flex flex-wrap items-center gap-2">
        <span className="type-meta text-meta">{T.filterStatus}</span>
        {[
          {
            label: T.all,
            on: !onlyUnread,
            h: href(base, { situacao: undefined, antes: undefined }),
          },
          {
            label: T.unread,
            on: onlyUnread,
            h: href(base, { situacao: "nao-lidas", antes: undefined }),
          },
        ].map((f) => (
          <a
            key={f.label}
            href={f.h}
            aria-current={f.on ? "true" : undefined}
            className={cx(
              "inline-flex min-h-tap items-center rounded-pill border border-line-control px-4 text-14 font-semibold no-underline",
              f.on ? "bg-section text-strong" : "bg-card-white text-meta hover:bg-section",
            )}
          >
            {f.label}
          </a>
        ))}
      </nav>
      <nav aria-label={T.filterKind} className="flex flex-wrap items-center gap-2">
        <span className="type-meta text-meta">{T.filterKind}</span>
        {[["", T.allKinds] as const, ...Object.entries(KIND_TEXT)].map(([k, label]) => (
          <a
            key={k || "todos"}
            href={href(base, { tipo: k || undefined, antes: undefined })}
            aria-current={(kind ?? "") === k ? "true" : undefined}
            className={cx(
              "inline-flex min-h-tap items-center rounded-pill border border-line-control px-3 text-14 no-underline",
              (kind ?? "") === k
                ? "bg-section font-semibold text-strong"
                : "bg-card-white text-meta hover:bg-section",
            )}
          >
            {label}
          </a>
        ))}
      </nav>

      <form action={markAllReadAction}>
        <Button type="submit" size="md" variant="outline">
          {T.markAll}
        </Button>
      </form>

      {!page.ok ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/notificacoes" size="md" variant="outline">
              Tentar de novo
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : page.value.items.length === 0 ? (
        <EmptyState title={T.empty} icon="check" />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line-subtle rounded-md border border-line-control bg-card-white">
            {page.value.items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        "rounded-xs px-1.5 type-meta font-semibold",
                        SEVERITY_STYLE[n.severity],
                      )}
                    >
                      {SEVERITY_BADGE[n.severity]}
                    </span>
                    <span className="type-meta text-meta">{KIND_TEXT[n.kind] ?? n.kind}</span>
                    <span className="type-meta text-meta">{formatDateTime(n.createdAt)}</span>
                    {n.readAt === null && (
                      <span className="type-meta font-semibold text-strong">Não lida</span>
                    )}
                  </p>
                  <p className={cx("text-16 text-strong", n.readAt === null && "font-semibold")}>
                    {n.title}
                  </p>
                  {n.body && <p className="type-body text-meta">{n.body}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button href={n.href} size="sm" variant="outline">
                    {T.open}
                  </Button>
                  {n.readAt === null && (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" size="sm" variant="text">
                        Marcar como lida
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {page.value.nextCursor && (
            <div>
              <Button
                href={href(base, { antes: page.value.nextCursor })}
                size="md"
                variant="text"
                iconRight="chevron-right"
              >
                {T.loadMore}
              </Button>
            </div>
          )}
        </>
      )}

      <StaffUrgentOptIn initialOn={urgentOn} action={setStaffAlertsAction} />
    </StudioScreen>
  );
}
