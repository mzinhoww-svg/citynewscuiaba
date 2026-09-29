import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { LABEL_EXPLAIN } from "@/content/pt-BR/labels";
import { LABEL_TEXT } from "@/lib/labels";
import type { LabelKind } from "@/lib/labels";
import { Button } from "../ui/Button";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

export interface GovernancePanelProps {
  providerFake: boolean;
  /** `null` = chave não cadastrada. */
  flags: Record<string, boolean | null>;
}

const flagText = (v: boolean | null) => (v === null ? T.flagMissing : v ? T.flagOn : T.flagOff);

/** Governança da IA (O16): política, rótulos de origem, chaves relacionadas e controles. */
export function GovernancePanel({ providerFake, flags }: GovernancePanelProps) {
  const labels = Object.keys(LABEL_TEXT) as LabelKind[];
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="gov-provider" className="flex flex-col gap-2">
        <h2 id="gov-provider" className="type-section text-strong">
          {T.govProviderTitle}
        </h2>
        <p className="type-body">{providerFake ? T.govProviderFake : T.govProviderReal}</p>
      </section>

      <section aria-labelledby="gov-policy" className="flex flex-col gap-3">
        <h2 id="gov-policy" className="type-section text-strong">
          {T.govPolicyTitle}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {T.govPolicy.map((p) => (
            <li
              key={p.title}
              className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <span className="type-body font-semibold text-strong">{p.title}</span>
              <span className="type-meta text-meta">{p.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gov-labels" className="flex flex-col gap-3">
        <h2 id="gov-labels" className="type-section text-strong">
          {T.govLabelsTitle}
        </h2>
        <AiOpsTable
          caption={T.govLabelsCaption}
          minWidthClass="min-w-[44rem]"
          columns={[T.colLabel, T.colMeaning]}
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
      </section>

      <section aria-labelledby="gov-flags" className="flex flex-col gap-3">
        <h2 id="gov-flags" className="type-section text-strong">
          {T.govFlagsTitle}
        </h2>
        <AiOpsTable
          caption={T.govFlagsCaption}
          minWidthClass="min-w-[44rem]"
          columns={[T.colFlag, T.colMeaning, T.colFlagState]}
        >
          {Object.entries(T.flagNames).map(([key, f]) => (
            <tr key={key} className={ROW}>
              <th scope="row" className={`${CELL} text-strong`}>
                <span className="block font-semibold">{f.name}</span>
                <span className="block type-meta text-meta">{key}</span>
              </th>
              <td className={CELL}>{f.body}</td>
              <td className={`${CELL} font-semibold text-strong`}>
                {flagText(flags[key] ?? null)}
              </td>
            </tr>
          ))}
        </AiOpsTable>
        <p className="type-meta text-meta">{T.flagsNote}</p>
      </section>

      <section aria-labelledby="gov-controls" className="flex flex-col gap-3">
        <h2 id="gov-controls" className="type-section text-strong">
          {T.govControlsTitle}
        </h2>
        <ul className="flex flex-wrap gap-3">
          {T.govControls.map((c) => (
            <li key={c.href}>
              <Button href={c.href} size="md" variant="outline">
                {c.label}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
