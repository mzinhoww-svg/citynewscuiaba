import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { maskIpField } from "@/lib/admin/audit-csv";
import type { SecurityLimit, SecuritySession } from "@/lib/db/queries/admin";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { AdminBlock } from "./AdminFields";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

export interface SecurityPanelProps {
  sessions: readonly SecuritySession[];
  limits: readonly SecurityLimit[];
  isAdmin: boolean;
  clearAction: (formData: FormData) => void | Promise<void>;
}

/** Segurança (A11): sessões da equipe, limites de uso, política e a ação auditada de liberar bloqueios. */
export function SecurityPanel({ sessions, limits, isAdmin, clearAction }: SecurityPanelProps) {
  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="sec-sessions" title={T.security.sessionsTitle}>
        {!isAdmin && <p className="type-meta text-meta">{T.security.maskedNote}</p>}
        {sessions.length === 0 ? (
          <EmptyState title={T.security.sessionsEmpty} icon="users" as="h3">
            {T.security.sessionsEmptyBody}
          </EmptyState>
        ) : (
          <AiOpsTable
            caption={T.security.sessionsCaption}
            minWidthClass="min-w-[52rem]"
            columns={[
              T.security.colPerson,
              T.security.colRoles,
              T.security.colSessions,
              T.security.colLast,
              T.security.colIp,
              T.security.colAgent,
            ]}
          >
            {sessions.map((s) => (
              <tr key={s.userId} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {s.name}
                </th>
                <td className={CELL}>{s.roles}</td>
                <td className={`${CELL} tabular-nums`}>{s.sessions}</td>
                <td className={`${CELL} tabular-nums`}>
                  {s.lastActive ? formatDateTime(s.lastActive) : T.security.never}
                </td>
                <td className={`${CELL} tabular-nums`}>{maskIpField(s.lastIp, isAdmin) || "—"}</td>
                <td className={`${CELL} break-words`}>
                  {s.lastAgent ? s.lastAgent.slice(0, 60) : "—"}
                </td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </AdminBlock>

      <AdminBlock id="sec-limits" title={T.security.limitsTitle}>
        {limits.length === 0 ? (
          <EmptyState title={T.security.limitsEmpty} icon="gauge" as="h3">
            {T.security.limitsEmptyBody}
          </EmptyState>
        ) : (
          <AiOpsTable
            caption={T.security.limitsCaption}
            minWidthClass="min-w-[40rem]"
            columns={[
              T.security.colBucket,
              T.security.colKeys,
              T.security.colHits,
              T.security.colMax,
            ]}
          >
            {limits.map((l) => (
              <tr key={l.bucket} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {T.security.buckets[l.bucket] ?? l.bucket}
                </th>
                <td className={`${CELL} tabular-nums`}>{l.keys}</td>
                <td className={`${CELL} tabular-nums`}>{l.hits}</td>
                <td className={`${CELL} tabular-nums`}>{l.maxHits}</td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </AdminBlock>

      <AdminBlock id="sec-policy" title={T.security.policyTitle}>
        <ul className="flex list-disc flex-col gap-1 pl-6 type-body">
          {T.security.policy.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </AdminBlock>

      <AdminBlock id="sec-clear" title={T.security.clearTitle}>
        <p className="type-body">{T.security.clearBody}</p>
        {isAdmin ? (
          <form action={clearAction}>
            <Button type="submit" variant="outline" size="md">
              {T.security.clear}
            </Button>
          </form>
        ) : (
          <p className="type-meta text-meta">{T.security.clearAdminOnly}</p>
        )}
      </AdminBlock>
    </div>
  );
}
