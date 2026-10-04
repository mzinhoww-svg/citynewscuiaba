/**
 * Mudança crítica (D-F3): só o que amplia direito de uso ou autonomia de publicação passa por
 * aprovação registrada (A-128: quem tem o papel aprova e aplica na mesma ação). Espelha exatamente `guard_source_changes` em
 * `supabase/migrations/0011_source_admin.sql` (`image_policy_rank`/`source_reliability_rank`).
 */
import type { FieldChange, ImagePolicy, Reliability, SourceConfig } from "./types";

export const IMAGE_POLICY_ORDER: readonly ImagePolicy[] = [
  "none",
  "licensed_only",
  "with_agreement",
  "reproduction",
];

export const RELIABILITY_ORDER: readonly Reliability[] = ["low", "standard", "verified", "primary"];

/** Campo do banco (snake_case) e valor em texto, para `require_source_critical_approval`. */
const DB_FIELD: Record<string, string> = {
  imagePolicy: "image_policy",
  republishPolicy: "republish_policy",
  reliability: "reliability",
  maySoleSource: "may_be_sole_source",
};

/** Diferença bruta de todo campo de `SourceConfig` (para o diff da auditoria, não só o crítico). */
export function diffConfig(before: SourceConfig, after: SourceConfig): FieldChange[] {
  const changes: FieldChange[] = [];
  const keys = new Set<keyof SourceConfig>([
    ...(Object.keys(before) as (keyof SourceConfig)[]),
    ...(Object.keys(after) as (keyof SourceConfig)[]),
  ]);
  for (const field of keys) {
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

/**
 * Subconjunto de `diffConfig` que é mudança crítica (D-F3): afrouxar `imagePolicy`; liberar
 * resumo (`link_only` → `summary_2_sentences`); confiabilidade subindo para `verified`/`primary`;
 * `maySoleSource` de falso para verdadeiro. Score, frequência e o resto aplicam na hora.
 */
export function criticalChanges(before: SourceConfig, after: SourceConfig): FieldChange[] {
  const changes: FieldChange[] = [];

  if (
    before.imagePolicy !== after.imagePolicy &&
    IMAGE_POLICY_ORDER.indexOf(after.imagePolicy) > IMAGE_POLICY_ORDER.indexOf(before.imagePolicy)
  ) {
    changes.push({ field: "imagePolicy", from: before.imagePolicy, to: after.imagePolicy });
  }

  if (before.republishPolicy === "link_only" && after.republishPolicy === "summary_2_sentences") {
    changes.push({
      field: "republishPolicy",
      from: before.republishPolicy,
      to: after.republishPolicy,
    });
  }

  if (
    before.reliability !== after.reliability &&
    (after.reliability === "verified" || after.reliability === "primary") &&
    RELIABILITY_ORDER.indexOf(after.reliability) > RELIABILITY_ORDER.indexOf(before.reliability)
  ) {
    changes.push({ field: "reliability", from: before.reliability, to: after.reliability });
  }

  if (!before.maySoleSource && after.maySoleSource) {
    changes.push({ field: "maySoleSource", from: false, to: true });
  }

  return changes;
}

/** `source:<id>:<campo_snake>=<valor>`, exatamente como `require_source_critical_approval`. */
export function targetRefFor(id: string, change: FieldChange): string {
  const field = DB_FIELD[change.field] ?? change.field;
  return `source:${id}:${field}=${String(change.to)}`;
}
