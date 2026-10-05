import type { Metadata } from "next";
import { Icon, Panel } from "@/components";
import { AdminTable } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { FLAG_TEXT } from "@/content/pt-BR/approvals";
import { requireRole } from "@/lib/auth/require-role";
import { integrationsOverview } from "@/lib/db/queries/admin-ops";
import { contingencyOverview } from "@/lib/db/queries/contingency";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Integrações · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const STATUS_ICON = {
  configured: "check",
  missing: "circle-alert",
  degraded: "triangle-alert",
} as const;
const STATUS_TONE = {
  configured: "text-service",
  missing: "text-danger",
  degraded: "text-warn",
} as const;

/** A13 · Integrações: serviços ligados e estado de configuração (nunca valores de chave). */
export default async function IntegrationsPage() {
  await requireRole("users.manage", undefined, { next: "/estudio/admin/integracoes" });
  const I = T.integrations;
  const data = await loadOrNull("admin integrations", async () => {
    const [rows, flags] = await Promise.all([
      integrationsOverview(process.env, I.detail, formatDateTime),
      contingencyOverview(),
    ]);
    return { rows, flags: flags.flags };
  });
  return (
    <AdminScreen
      title={I.title}
      intro={I.intro}
      retryHref="/estudio/admin/integracoes"
      failed={data === null}
    >
      {data && (
        <div className="flex flex-col gap-8">
          <AdminTable
            caption={I.table}
            headers={[I.col.name, I.col.role, I.col.status, I.col.detail]}
          >
            {data.value.rows.map((r) => (
              <tr key={r.id} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                  {I.items[r.id].name}
                </th>
                <td className="px-3 py-3 type-body text-body">{I.items[r.id].role}</td>
                <td className="px-3 py-3 type-body text-strong">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon
                      name={STATUS_ICON[r.status]}
                      size={16}
                      className={STATUS_TONE[r.status]}
                    />
                    {I[r.status]}
                  </span>
                </td>
                <td className="px-3 py-3 type-body text-body">{r.detail.join(" · ") || "—"}</td>
              </tr>
            ))}
          </AdminTable>
          <Panel aria-labelledby="int-flags" className="flex flex-col gap-2">
            <h2 id="int-flags" className="type-section text-strong">
              {I.flags}
            </h2>
            <ul className="flex flex-col gap-1 type-body text-body">
              {(
                [
                  "ai_enabled",
                  "source_link_analysis",
                  "image_reproduction_enabled",
                  "personalization_enabled",
                ] as const
              ).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <Icon
                    name={data.value.flags[k]?.enabled ? "check" : "pause"}
                    size={16}
                    className={data.value.flags[k]?.enabled ? "text-service" : "text-meta"}
                  />
                  {FLAG_TEXT[k]}: {data.value.flags[k]?.enabled ? "ligada" : "desligada"}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </AdminScreen>
  );
}
