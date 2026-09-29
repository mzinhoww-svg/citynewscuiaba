/**
 * Opções e regras compartilhadas pelos formulários do painel de fontes (assistente e aba
 * Configuração). Puro: sem estado, sem banco.
 */
import { FAST_FREQUENCIES } from "@/lib/sources/schema";
import type { ImagePolicy, Reliability, RepublishPolicy, SourceConfig } from "@/lib/sources/types";
import { criticalChanges } from "@/lib/sources/critical";
import {
  formatMinutes,
  IMAGE_POLICY_TEXT,
  LAYER_TEXT,
  NORMAL_FREQUENCY_GRID,
  PRIORITY_TEXT,
  RELIABILITY_TEXT,
  REPUBLISH_POLICY_TEXT,
} from "@/content/pt-BR/sources-admin";
import { FREQUENCY_FIELD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import type { OptionGroupLike, OptionLike } from "./fields";

export const LOCALITY_OPTIONS: OptionLike[] = (
  ["cuiaba", "varzea-grande", "mt", "nacional"] as const
).map((l) => ({ value: l, label: LOCALITY_TEXT[l] ?? l }));

export const IMAGE_POLICY_OPTIONS: OptionLike[] = (
  ["none", "licensed_only", "with_agreement", "reproduction"] as const
).map((v) => ({ value: v, label: IMAGE_POLICY_TEXT[v] }));

export const REPUBLISH_OPTIONS: OptionLike[] = (["link_only", "summary_2_sentences"] as const).map(
  (v) => ({ value: v, label: REPUBLISH_POLICY_TEXT[v] }),
);

export const RELIABILITY_OPTIONS: OptionLike[] = (
  ["low", "standard", "verified", "primary"] as const
).map((v) => ({ value: v, label: RELIABILITY_TEXT[v] }));

export const LAYER_OPTIONS: OptionLike[] = ([1, 2, 3, 4] as const).map((l) => ({
  value: String(l),
  label: `${l} · ${LAYER_TEXT[l]}`,
}));

export const PRIORITY_OPTIONS: OptionLike[] = ([1, 2, 3] as const).map((p) => ({
  value: String(p),
  label: PRIORITY_TEXT[p],
}));

export const STRATEGY_VALUES = [
  "rss",
  "atom",
  "jsonfeed",
  "sitemap_news",
  "page_list",
  "page_article",
] as const;

export interface FrequencyChoiceOptions {
  defaultMinutes: number;
  /** Mostra o grupo da via rápida (o cadastro nunca mostra: fonte nova nasce no ciclo normal). */
  showFast: boolean;
  /** Motivo para desabilitar a via rápida (fonte inativa ou sem vaga); `null` = habilitada. */
  fastDisabledReason: string | null;
}

/**
 * Campo Frequência (spec §7.2): "Padrão (30 min)", grupo "Via rápida" (10, 15, 20) e grupo
 * "Ciclo normal" (múltiplos de 30 de 30 min a 24 h). 25 e 45 nunca aparecem.
 */
export function frequencyGroups(o: FrequencyChoiceOptions): {
  options: OptionLike[];
  groups: OptionGroupLike[];
} {
  const options = [
    { value: "padrao", label: FREQUENCY_FIELD_TEXT.defaultOption(formatMinutes(o.defaultMinutes)) },
  ];
  const groups: OptionGroupLike[] = [];
  if (o.showFast)
    groups.push({
      label: FREQUENCY_FIELD_TEXT.fastGroup,
      options: FAST_FREQUENCIES.map((m) => ({
        value: String(m),
        label: formatMinutes(m),
        disabled: o.fastDisabledReason !== null,
      })),
    });
  groups.push({
    label: FREQUENCY_FIELD_TEXT.normalGroup,
    options: NORMAL_FREQUENCY_GRID.map((m) => ({ value: String(m), label: formatMinutes(m) })),
  });
  return { options, groups };
}

export type RightsFields = {
  imagePolicy: ImagePolicy;
  republishPolicy: RepublishPolicy;
  reliability: Reliability;
  maySoleSource: boolean;
};

const BASE: SourceConfig = {
  name: "",
  displayName: null,
  slug: "",
  layer: null,
  categories: [],
  locality: "mt",
  reliability: "standard",
  imagePolicy: "none",
  republishPolicy: "link_only",
  maySoleSource: false,
  agreementUntil: null,
  agreementNote: null,
  termsUrl: null,
  strategy: "rss",
  baseUrl: "",
  feedUrl: null,
  pageSelectors: null,
  frequencyMinutes: null,
  rateLimitPerHour: 20,
  termsMinIntervalMinutes: null,
  editorialScore: 3,
  priority: 2,
  recPinned: false,
  recLocalHighlight: false,
  recExcluded: false,
};

/** Campos que AFROUXAM direitos (D-F3) e por isso exigem segunda aprovação. */
export function looseningFields(before: RightsFields, after: RightsFields): string[] {
  return criticalChanges({ ...BASE, ...before }, { ...BASE, ...after }).map((c) => c.field);
}

/** Campos críticos que ficaram mais restritos (aplicam na hora). */
export function tighteningFields(before: RightsFields, after: RightsFields): string[] {
  return looseningFields(after, before);
}
