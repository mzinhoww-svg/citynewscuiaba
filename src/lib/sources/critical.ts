import type { ImagePolicy, Reliability, SourceConfig } from "./types";

/** Do mais restrito ao mais permissivo. */
export const IMAGE_POLICY_ORDER: readonly ImagePolicy[] = [
  "none",
  "licensed_only",
  "with_agreement",
  "reproduction",
];
/** Da menos à mais confiável. */
export const RELIABILITY_ORDER: readonly Reliability[] = ["low", "standard", "verified", "primary"];

export interface FieldChange {
  field: keyof SourceConfig;
  from: unknown;
  to: unknown;
}

const FIELDS: readonly (keyof SourceConfig)[] = [
  "name",
  "displayName",
  "ownerId",
  "layer",
  "categories",
  "locality",
  "reliability",
  "imagePolicy",
  "republishPolicy",
  "maySoleSource",
  "agreementUntil",
  "agreementNote",
  "termsUrl",
  "termsMinIntervalMinutes",
  "frequencyMinutes",
  "rateLimitPerHour",
  "editorialScore",
  "priority",
];

/** Todos os campos que mudaram (comparação profunda por JSON), na ordem de `SourceConfig`. */
export function diffConfig(before: SourceConfig, after: SourceConfig): FieldChange[] {
  return FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])).map(
    (field) => ({
      field,
      from: before[field],
      to: after[field],
    }),
  );
}

/** Mudanças que ampliam direitos e exigem segunda pessoa (D-F3). Tudo o mais aplica na hora. */
export function criticalChanges(before: SourceConfig, after: SourceConfig): FieldChange[] {
  return diffConfig(before, after).filter((c) => {
    switch (c.field) {
      case "imagePolicy":
        return (
          IMAGE_POLICY_ORDER.indexOf(after.imagePolicy) >
          IMAGE_POLICY_ORDER.indexOf(before.imagePolicy)
        );
      case "republishPolicy":
        return (
          before.republishPolicy === "link_only" && after.republishPolicy === "summary_2_sentences"
        );
      case "reliability": {
        const to = RELIABILITY_ORDER.indexOf(after.reliability);
        return (
          to > RELIABILITY_ORDER.indexOf(before.reliability) &&
          to >= RELIABILITY_ORDER.indexOf("verified")
        );
      }
      case "maySoleSource":
        return !before.maySoleSource && after.maySoleSource;
      default:
        return false;
    }
  });
}

const SNAKE: Partial<Record<keyof SourceConfig, string>> = {
  imagePolicy: "image_policy",
  republishPolicy: "republish_policy",
  reliability: "reliability",
  maySoleSource: "may_be_sole_source",
};

/** Alvo da aprovação: `source:<id>:<campo_snake>=<valor>`. */
export function targetRefFor(id: string, change: FieldChange): string {
  const field = SNAKE[change.field] ?? change.field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return `source:${id}:${field}=${String(change.to)}`;
}
