import { REVIEW_TEXT as T } from "@/content/pt-BR/studio";
import type { DiffPart } from "@/lib/diff/words";
import { cx } from "../cx";
import { VersionDiff } from "../editorial/VersionDiff";

export interface FieldDiffItem {
  label: string;
  parts: DiffPart[];
}

export interface FieldDiffProps {
  fields: FieldDiffItem[];
  className?: string;
}

/**
 * Campos modificados na revisão de item autônomo (E03): versão da IA × texto atual, por campo.
 * Campo sem mudança aparece como "sem mudança"; acréscimos sublinhados e remoções riscadas com
 * aviso textual (VersionDiff).
 */
export function FieldDiff({ fields, className }: FieldDiffProps) {
  const changed = fields.filter((f) => f.parts.some((p) => p.type !== "same"));
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {changed.length === 0 ? (
        <p className="type-body text-meta">{T.noChanges}</p>
      ) : (
        <dl className="flex flex-col gap-4">
          {changed.map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <dt className="type-eyebrow text-meta">{f.label}</dt>
              <dd>
                <VersionDiff parts={f.parts} className="max-w-none" />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
