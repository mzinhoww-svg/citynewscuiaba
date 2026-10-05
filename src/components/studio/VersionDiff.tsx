import { VERSIONS_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { VersionDiff } from "../editorial/VersionDiff";
import { Panel } from "../ui/Panel";

export type VersionDiffOp = { op: "eq" | "add" | "del"; text: string };

export interface VersionCompareField {
  label: string;
  ops: VersionDiffOp[];
}

export interface VersionCompareProps {
  fromLabel: string;
  toLabel: string;
  fields: VersionCompareField[];
  className?: string;
}

/**
 * Comparação de duas versões no Estúdio (E05): legenda textual (acrescentado sublinhado,
 * removido riscado) e um bloco por campo. Campo igual diz "sem mudança".
 *
 * ```tsx
 * <VersionCompare fromLabel="v1" toLabel="v3" fields={[{ label: "Título", ops: diffText(a, b) }]} />
 * ```
 */
export function VersionCompare({ fromLabel, toLabel, fields, className }: VersionCompareProps) {
  const anyChange = fields.some((f) => f.ops.some((o) => o.op !== "eq"));
  return (
    <section
      className={cx("flex flex-col gap-4", className)}
      aria-label={`${fromLabel} × ${toLabel}`}
    >
      <p className="flex flex-wrap items-center gap-3 type-meta text-meta">
        <span>{T.legend}:</span>
        <ins className="bg-cerrado-soft text-strong underline decoration-2 underline-offset-4">
          {T.legendAdded}
        </ins>
        <del className="bg-erro-soft text-strong line-through decoration-2">{T.legendRemoved}</del>
      </p>
      {!anyChange && <p className="type-body text-meta">{T.noChanges}</p>}
      <dl className="flex flex-col gap-5">
        {fields.map((f) => {
          const changed = f.ops.some((o) => o.op !== "eq");
          return (
            <Panel as="div" key={f.label}>
              <dt className="type-eyebrow text-meta">{f.label}</dt>
              <dd className="mt-2">
                {changed ? (
                  <VersionDiff
                    parts={f.ops.map((o) => ({
                      type: o.op === "eq" ? "same" : o.op,
                      text: o.text,
                    }))}
                    className="max-w-none"
                  />
                ) : (
                  <p className="type-body text-meta">{T.unchanged}</p>
                )}
              </dd>
            </Panel>
          );
        })}
      </dl>
    </section>
  );
}
