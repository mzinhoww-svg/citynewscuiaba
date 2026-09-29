import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import type { IntegrationView } from "@/lib/admin/integrations";
import { Icon, type IconName } from "../ui/Icon";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

const ICON: Record<IntegrationView["state"], IconName> = {
  connected: "check",
  simulated: "refresh-cw",
  pending: "clock",
  error: "circle-alert",
  off: "info",
};

function note(v: IntegrationView): string {
  const n = T.integrations.notes;
  switch (v.id) {
    case "supabase":
      return n.supabase[v.state as "connected" | "error" | "off"];
    case "openrouter":
      return n.openrouter[v.state as "connected" | "simulated"];
    case "email":
      return n.email.pending(v.fact ?? "0");
    case "google":
      return n.google[v.state as "connected" | "pending"];
    case "vercel":
      return v.state === "connected" ? n.vercel.connected(v.fact ?? "") : n.vercel.off;
  }
}

/** Integrações (A13): estado em texto e ícone, sem nenhum valor de variável de ambiente. */
export function IntegrationsTable({ items }: { items: readonly IntegrationView[] }) {
  return (
    <AiOpsTable
      caption={T.integrations.caption}
      minWidthClass="min-w-[52rem]"
      columns={[
        T.integrations.colName,
        T.integrations.colState,
        T.integrations.colWhat,
        T.integrations.colNote,
      ]}
    >
      {items.map((v) => (
        <tr key={v.id} className={ROW} data-integration={v.id} data-state={v.state}>
          <th scope="row" className={`${CELL} font-semibold text-strong`}>
            {T.integrations.names[v.id]}
          </th>
          <td className={CELL}>
            <span
              className={`inline-flex items-center gap-1 ${v.state === "error" ? "font-semibold text-danger" : ""}`}
            >
              <Icon name={ICON[v.state]} size={16} />
              {T.integrations.states[v.state]}
            </span>
          </td>
          <td className={CELL}>{T.integrations.what[v.id]}</td>
          <td className={CELL}>{note(v)}</td>
        </tr>
      ))}
    </AiOpsTable>
  );
}
