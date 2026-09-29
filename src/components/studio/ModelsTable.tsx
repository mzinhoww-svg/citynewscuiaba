import { AI_ADMIN_TEXT as T, agentLabel } from "@/content/pt-BR/control-ai";

export interface ModelsTableRow {
  id: string;
  name: string;
  provider: string;
  version: string;
  maxTokens: number | null;
  temperature: number | null;
  costPer1kIn: number | null;
  costPer1kOut: number | null;
  active: boolean;
  usedBy: string[];
}

const num = (n: number | null, digits = 5) =>
  n === null
    ? T.notApplicable
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: Math.min(2, digits),
        maximumFractionDigits: digits,
      });

/** Modelos registrados (O11): custo por mil tokens em reais, limites e quem usa. */
export interface ModelsTableProps {
  rows: ModelsTableRow[];
}

export function ModelsTable({ rows }: ModelsTableProps) {
  return (
    <div
      role="region"
      aria-label={T.modelsCaption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className="w-full min-w-[60rem] border-collapse text-left">
        <caption className="sr-only">{T.modelsCaption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              {T.colModelName}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colProvider}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colVersion}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colCostIn}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colCostOut}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colMaxTokens}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colTemperature}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colUsedBy}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colState}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line-subtle align-top last:border-b-0">
              <th scope="row" className="px-3 py-3 type-body text-strong">
                <span className="block font-semibold">{m.name}</span>
                <span className="block type-meta text-meta">{m.id}</span>
              </th>
              <td className="px-3 py-3 type-body">{m.provider}</td>
              <td className="px-3 py-3 type-body">{m.version}</td>
              <td className="px-3 py-3 type-body tabular-nums">{num(m.costPer1kIn)}</td>
              <td className="px-3 py-3 type-body tabular-nums">{num(m.costPer1kOut)}</td>
              <td className="px-3 py-3 type-body tabular-nums">
                {m.maxTokens === null ? T.notApplicable : m.maxTokens.toLocaleString("pt-BR")}
              </td>
              <td className="px-3 py-3 type-body tabular-nums">{num(m.temperature, 1)}</td>
              <td className="px-3 py-3 type-body">
                {m.usedBy.length === 0 ? T.usedByNone : m.usedBy.map(agentLabel).join(", ")}
              </td>
              <td className="px-3 py-3 type-body font-semibold text-strong">
                {m.active ? T.statusActive : T.statusInactive}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
