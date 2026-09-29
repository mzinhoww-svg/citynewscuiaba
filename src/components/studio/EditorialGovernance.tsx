import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { LABEL_EXPLAIN } from "@/content/pt-BR/labels";
import type { GovernanceNumbers } from "@/lib/db/queries/admin";
import { LABEL_TEXT, type LabelKind } from "@/lib/labels";
import { Button } from "../ui/Button";
import { AdminBlock } from "./AdminFields";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

const flagText = (v: boolean | null) =>
  v === null ? T.governance.flagMissing : v ? T.governance.flagOn : T.governance.flagOff;

/** Governança editorial (A12): regras em vigor, chaves, princípios e rótulos de origem, em leitura. */
export function EditorialGovernance({ numbers }: { numbers: GovernanceNumbers }) {
  const labels = Object.keys(LABEL_TEXT) as LabelKind[];
  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="gv-rules" title={T.governance.rulesTitle}>
        <AiOpsTable
          caption={T.governance.rulesCaption}
          minWidthClass="min-w-[36rem]"
          columns={[T.governance.colItem, T.governance.colState]}
        >
          <tr className={ROW}>
            <th scope="row" className={`${CELL} font-semibold text-strong`}>
              {T.governance.rulesVersion}
            </th>
            <td className={CELL}>
              {numbers.activeRulesVersion === null
                ? T.governance.rulesNone
                : `v${numbers.activeRulesVersion}`}
            </td>
          </tr>
          <tr className={ROW}>
            <th scope="row" className={`${CELL} font-semibold text-strong`}>
              {T.governance.forceReview}
            </th>
            <td className={CELL}>
              {numbers.forceReview === null
                ? "—"
                : numbers.forceReview
                  ? T.common.yes
                  : T.common.no}
            </td>
          </tr>
          <tr className={ROW}>
            <th scope="row" className={`${CELL} font-semibold text-strong`}>
              {T.governance.pending}
            </th>
            <td className={`${CELL} tabular-nums`}>{numbers.pendingApprovals}</td>
          </tr>
          {Object.entries(T.governance.flags).map(([key, name]) => (
            <tr key={key} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {name}
              </th>
              <td className={CELL}>{flagText(numbers.flags[key] ?? null)}</td>
            </tr>
          ))}
        </AiOpsTable>
        <div className="flex flex-wrap gap-3">
          <Button href="/estudio/control/regras" size="md" variant="outline">
            {T.governance.links.rules}
          </Button>
          <Button href="/estudio/control/aprovacoes" size="md" variant="outline">
            {T.governance.links.approvals}
          </Button>
        </div>
      </AdminBlock>

      <AdminBlock id="gv-principles" title={T.governance.principlesTitle}>
        <ul className="grid gap-3 md:grid-cols-2">
          {T.governance.principles.map((p) => (
            <li
              key={p.title}
              className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <span className="type-body font-semibold text-strong">{p.title}</span>
              <span className="type-meta text-meta">{p.body}</span>
            </li>
          ))}
        </ul>
      </AdminBlock>

      <AdminBlock id="gv-labels" title="Rótulos de origem">
        <AiOpsTable
          caption="Rótulos de origem e o que significam"
          minWidthClass="min-w-[36rem]"
          columns={["Rótulo", "Significado"]}
        >
          {labels.map((k) => (
            <tr key={k} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {LABEL_TEXT[k]}
              </th>
              <td className={CELL}>{LABEL_EXPLAIN[k]}</td>
            </tr>
          ))}
        </AiOpsTable>
      </AdminBlock>
    </div>
  );
}
