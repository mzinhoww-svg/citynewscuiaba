import {
  categoryText,
  MODE_TEXT,
  orderedCategories,
  RULE_FIELD_TEXT as F,
  RULES_TEXT as T,
} from "@/content/pt-BR/rules-admin";
import type { RuleSet } from "@/lib/rules";
import { cx } from "../cx";

export interface RuleMatrixProps {
  rules: RuleSet;
  caption: string;
  className?: string;
}

const n2 = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
const yesNo = (v: boolean) => (v ? T.yes : T.no);

/**
 * Matriz de regras por categoria (O05, spec §6.4), só leitura: modo, mínimo de fontes, primária,
 * imagem aprovada, confiança mínima e tamanho do resumo. `<th scope>` nas duas direções.
 */
export function RuleMatrix({ rules, caption, className }: RuleMatrixProps) {
  const cols = [
    F.mode,
    F.minSources,
    F.requirePrimary,
    F.requireApprovedImage,
    F.minScore,
    F.summaryWords,
  ];
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cx(
        "overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table className="w-full min-w-[48rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              Categoria
            </th>
            {cols.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedCategories(rules.categories).map(([key, c]) => (
            <tr key={key} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {categoryText(key)}
              </th>
              <td className="px-3 py-3 type-body text-body">{MODE_TEXT[c.mode]}</td>
              <td className="px-3 py-3 type-body text-body tabular-nums">{c.minSources}</td>
              <td className="px-3 py-3 type-body text-body">{yesNo(c.requirePrimary)}</td>
              <td className="px-3 py-3 type-body text-body">{yesNo(c.requireApprovedImage)}</td>
              <td className="px-3 py-3 type-body text-body tabular-nums">{n2(c.minScore)}</td>
              <td className="px-3 py-3 type-body text-body tabular-nums">
                {c.summaryWords ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
