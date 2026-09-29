import {
  CATEGORY_ORDER,
  RULE_MODE_LABEL,
  RULES_ADMIN_TEXT as T,
  categoryLabel,
} from "@/content/pt-BR/control-rules";
import { isNeverAutoCategory } from "@/lib/rules/safety";
import type { CategoryRule, Mode } from "@/lib/rules/types";
import { cx } from "../cx";

export interface RuleMatrixProps {
  categories: Record<string, CategoryRule>;
  /** Legenda da tabela (lida por leitor de tela). */
  caption: string;
  /** Edição da proposta; sem ela, a matriz é só leitura. */
  onChange?: (category: string, patch: Partial<CategoryRule>) => void;
  /** Campos com problema (`categories.<cat>.<campo>`), marcados como inválidos. */
  invalid?: ReadonlySet<string>;
  className?: string;
}

const MODES: Mode[] = ["auto", "auto_notify", "review", "blocked"];
/** Segurança e urgentes nunca publicam sozinhos (CLAUDE.md regra 8): nem aparece a opção. */
const SAFE_MODES: Mode[] = ["review", "blocked"];

const n2 = (x: number) => x.toFixed(2).replace(".", ",");
const control = "border-control h-tap rounded-md bg-input px-2 type-body text-strong tabular-nums";

function numberOrNull(raw: string, parse: (s: string) => number): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = parse(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Matriz das regras de autonomia por categoria (O05; spec §6.4): modo, mínimo de fontes,
 * primária, imagem aprovada, confiança mínima e tamanho do resumo. Só leitura ou editável
 * (proposta), sempre em tabela com cabeçalhos de coluna e de linha.
 */
export function RuleMatrix({ categories, caption, onChange, invalid, className }: RuleMatrixProps) {
  // O jsonb não guarda a ordem das chaves: segue a ordem da spec §6.4, depois alfabética.
  const rank = (k: string) => {
    const i = CATEGORY_ORDER.indexOf(k);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  const entries = Object.entries(categories).sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  );
  const bad = (key: string, field: string) => invalid?.has(`categories.${key}.${field}`) ?? false;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cx(
        "relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              {T.colCategory}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colMode}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colMinSources}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colPrimary}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colImage}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colMinScore}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colSummary}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, r]) => {
            const name = categoryLabel(key);
            const safe = isNeverAutoCategory(key);
            const label = (col: string) => T.fieldLabel(col, name);
            return (
              <tr key={key} className="border-b border-line-subtle align-middle last:border-b-0">
                <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                  {name}
                </th>
                {onChange ? (
                  <>
                    <td className="px-3 py-2">
                      <select
                        aria-label={label(T.colMode)}
                        value={r.mode}
                        onChange={(e) => onChange(key, { mode: e.target.value as Mode })}
                        aria-invalid={bad(key, "mode") || undefined}
                        className={cx(
                          control,
                          "w-full min-w-44 cursor-pointer",
                          bad(key, "mode") && "field-error",
                        )}
                      >
                        {(safe ? SAFE_MODES : MODES).map((m) => (
                          <option key={m} value={m}>
                            {RULE_MODE_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10}
                        step={1}
                        aria-label={label(T.colMinSources)}
                        value={Number.isFinite(r.minSources) ? r.minSources : ""}
                        onChange={(e) =>
                          onChange(key, {
                            minSources: numberOrNull(e.target.value, Number) ?? Number.NaN,
                          })
                        }
                        aria-invalid={bad(key, "minSources") || undefined}
                        className={cx(control, "w-20", bad(key, "minSources") && "field-error")}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={label(T.colPrimary)}
                        checked={r.requirePrimary}
                        onChange={(e) => onChange(key, { requirePrimary: e.target.checked })}
                        className="size-5 accent-(--action-primary)"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={label(T.colImage)}
                        checked={r.requireApprovedImage}
                        onChange={(e) => onChange(key, { requireApprovedImage: e.target.checked })}
                        className="size-5 accent-(--action-primary)"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={1}
                        step={0.05}
                        aria-label={label(T.colMinScore)}
                        value={r.minScore === null || Number.isNaN(r.minScore) ? "" : r.minScore}
                        onChange={(e) =>
                          onChange(key, { minScore: numberOrNull(e.target.value, Number) })
                        }
                        aria-invalid={bad(key, "minScore") || undefined}
                        className={cx(control, "w-24", bad(key, "minScore") && "field-error")}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={10}
                        max={400}
                        step={10}
                        aria-label={label(T.colSummary)}
                        value={
                          r.summaryWords === null || Number.isNaN(r.summaryWords)
                            ? ""
                            : r.summaryWords
                        }
                        onChange={(e) =>
                          onChange(key, { summaryWords: numberOrNull(e.target.value, Number) })
                        }
                        aria-invalid={bad(key, "summaryWords") || undefined}
                        className={cx(control, "w-24", bad(key, "summaryWords") && "field-error")}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3 type-body">{RULE_MODE_LABEL[r.mode]}</td>
                    <td className="px-3 py-3 type-body tabular-nums">{r.minSources}</td>
                    <td className="px-3 py-3 type-body">{r.requirePrimary ? T.yes : T.no}</td>
                    <td className="px-3 py-3 type-body">{r.requireApprovedImage ? T.yes : T.no}</td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {r.minScore === null ? T.notApplicable : n2(r.minScore)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {r.summaryWords ?? T.notApplicable}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
