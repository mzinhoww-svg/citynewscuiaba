import Link from "next/link";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { Table } from "../ui/Table";
import type { IconName } from "../ui/Icon";

export type EventSituation = "no_ar" | "retirado" | "encerrado" | "sem_confirmacao";

export interface EventsTableRow {
  id: string;
  title: string;
  startsAt: string;
  venue: string;
  /** official | organizer | reader | newsroom */
  origin: string;
  /** Nome da fonte; `null` sem fonte (redação, leitor). */
  source: string | null;
  situation: EventSituation;
  lockedFields: readonly string[];
}

export interface EventsTableProps {
  rows: readonly EventsTableRow[];
  /** Endereço de edição de um evento. */
  hrefFor: (id: string) => string;
  /** Server Actions de retirar e devolver (campo `id`); ausentes = só leitura. */
  withdraw?: (form: FormData) => Promise<void>;
  restore?: (form: FormData) => Promise<void>;
}

const SITUATION: Record<EventSituation, { tone: StatusTone; icon: IconName }> = {
  no_ar: { tone: "success", icon: "check" },
  retirado: { tone: "danger", icon: "eye-off" },
  encerrado: { tone: "neutral", icon: "history" },
  sem_confirmacao: { tone: "warn", icon: "circle-help" },
};

/**
 * Eventos da Agenda no Estúdio (AGM-T7): nome com origem e campos travados, data, local, fonte,
 * situação em texto (nunca só cor) e as ações Editar e Retirar/Devolver. Retirar e devolver são
 * formulários com Server Action: funcionam sem JavaScript.
 */
export function EventsTable({ rows, hrefFor, withdraw, restore }: EventsTableProps) {
  const H = T.table.headers;
  return (
    <Table
      caption={T.table.caption}
      minWidth="xl"
      headers={[
        H.event,
        H.when,
        H.venue,
        H.source,
        H.situation,
        { label: H.actions, srOnly: true },
      ]}
    >
      {rows.map((e) => {
        const look = SITUATION[e.situation];
        const action = e.situation === "retirado" ? restore : withdraw;
        return (
          <tr key={e.id} className="border-t border-line-subtle align-top">
            <td className="px-3 py-3">
              <div className="flex flex-col gap-1">
                <Link
                  href={hrefFor(e.id)}
                  className="type-body font-semibold text-strong underline-offset-2 hover:underline"
                >
                  {e.title}
                </Link>
                <span className="type-meta text-meta">
                  {T.origin[e.origin] ?? e.origin}
                  {e.lockedFields.length > 0 && ` · ${T.table.locked(e.lockedFields.length)}`}
                </span>
              </div>
            </td>
            <td className="px-3 py-3 type-meta text-strong whitespace-nowrap">
              {formatDateTime(e.startsAt)}
            </td>
            <td className="px-3 py-3 type-meta text-strong">{e.venue}</td>
            <td className="px-3 py-3 type-meta text-strong">
              {e.source ?? (e.origin === "newsroom" ? T.table.newsroom : T.table.noSource)}
            </td>
            <td className="px-3 py-3">
              <StatusBadge tone={look.tone} icon={look.icon}>
                {T.situation[e.situation]}
              </StatusBadge>
            </td>
            <td className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  href={hrefFor(e.id)}
                  size="sm"
                  variant="text"
                  icon="pencil"
                  aria-label={T.table.edit(e.title)}
                >
                  {T.table.editShort}
                </Button>
                {action && (
                  <form action={action}>
                    <input type="hidden" name="id" value={e.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      icon={e.situation === "retirado" ? "eye" : "eye-off"}
                      aria-label={
                        e.situation === "retirado"
                          ? T.table.restoreOf(e.title)
                          : T.table.withdrawOf(e.title)
                      }
                    >
                      {e.situation === "retirado" ? T.table.restore : T.table.withdraw}
                    </Button>
                  </form>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
