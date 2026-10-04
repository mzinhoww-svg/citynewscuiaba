import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { formatDateTime } from "@/lib/format/date";
import type { FeaturedHistoryRow } from "@/lib/db/queries/admin";
import { AdminTable } from "../admin/AdminStatus";

export interface PinHistoryProps {
  rows: readonly FeaturedHistoryRow[];
  /** Nome legível da posição (`home.lead` → "Início · manchete"). */
  slotLabel: (slotKey: string, sectionSlug: string | null) => string;
  id?: string;
}

const H = T.history;

/** Últimos pinos (ativos, removidos e expirados): quando, posição, matéria, quem e situação. */
export function PinHistory({ rows, slotLabel, id = "destaques-historico" }: PinHistoryProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="type-section text-strong">
        {H.title}
      </h2>
      {rows.length === 0 ? (
        <p className="type-body text-meta">{H.empty}</p>
      ) : (
        <AdminTable
          caption={H.title}
          headers={[H.col.when, H.col.slot, H.col.article, H.col.who, H.col.state]}
        >
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-subtle last:border-0">
              <td className="px-3 py-2 type-body text-body tabular-nums">{formatDateTime(r.at)}</td>
              <td className="px-3 py-2 type-body text-body">
                {slotLabel(r.slotKey, r.sectionSlug)}
              </td>
              <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                {r.title}
              </th>
              <td className="px-3 py-2 type-body text-body">{r.by ?? "—"}</td>
              <td className="px-3 py-2 type-body text-body">
                {H.state[r.state]}
                {r.state === "active" && (
                  <span className="text-meta">
                    {" · "}
                    {r.endsAt ? T.until(formatDateTime(r.endsAt)) : T.untilRemoved}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </section>
  );
}
