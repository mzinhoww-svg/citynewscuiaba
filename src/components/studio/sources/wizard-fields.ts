import type { LinkAnalysis } from "@/lib/sources/analyze";
import type { ImagePolicy, Reliability, RepublishPolicy } from "@/lib/sources/types";
import type { FieldSuggestion } from "./SuggestionField";

/** Estado do formulário de revisão do assistente "Nova fonte" (texto cru, como digitado). */
export interface WizardFields {
  name: string;
  displayName: string;
  slug: string;
  layer: string;
  categories: string;
  locality: string;
  reliability: Reliability;
  imagePolicy: ImagePolicy;
  republishPolicy: RepublishPolicy;
  maySoleSource: boolean;
  frequency: string;
  rateLimit: string;
  score: string;
  priority: string;
  termsUrl: string;
  termsMinInterval: string;
  agreementUntil: string;
  agreementNote: string;
  termsReviewed: boolean;
  justification: string;
}

/** Padrão restrito de toda fonte nova (D-F3): o que passar disso vira pedido de aprovação. */
export const RESTRICTED = {
  imagePolicy: "none",
  republishPolicy: "link_only",
  reliability: "standard",
  maySoleSource: false,
} as const;

export function initialFields(a: LinkAnalysis): WizardFields {
  return {
    name: a.rules.name.value,
    displayName: "",
    slug: a.rules.slug.value,
    layer: String(a.rules.layer.value),
    categories: "",
    locality: "mt",
    reliability: "standard",
    imagePolicy: "none",
    republishPolicy: "link_only",
    maySoleSource: false,
    frequency: a.rules.frequency.value === null ? "padrao" : String(a.rules.frequency.value),
    rateLimit: String(a.rules.rateLimitPerHour.value),
    score: "3",
    priority: "2",
    termsUrl: a.termsLinks[0] ?? "",
    termsMinInterval: "",
    agreementUntil: "",
    agreementNote: "",
    termsReviewed: false,
    justification: "",
  };
}

/** Sugestões por campo (regra ou IA) no formato do `SuggestionField`. */
export function suggestionsOf(a: LinkAnalysis): Record<string, FieldSuggestion | null> {
  const ai = a.aiStatus === "ok" ? a.ai : null;
  return {
    name: { value: a.rules.name.value, origin: "regra" },
    slug: { value: a.rules.slug.value, origin: "regra" },
    layer: { value: a.rules.layer.value, origin: "regra" },
    frequencyMinutes: {
      value: a.rules.frequency.value === null ? "padrao" : a.rules.frequency.value,
      origin: "regra",
    },
    rateLimitPerHour: { value: a.rules.rateLimitPerHour.value, origin: "regra" },
    reliability:
      a.rules.reliability.value !== "standard"
        ? { value: a.rules.reliability.value, origin: "regra" }
        : null,
    categories: ai && ai.categories.value.length > 0 ? { ...ai.categories } : null,
    locality: ai ? { ...ai.locality } : null,
  };
}

/** Valor atual de cada campo com sugestão (para `accepted_fields`). */
export function currentOf(f: WizardFields): Record<string, string> {
  return {
    name: f.name,
    slug: f.slug,
    layer: f.layer,
    frequencyMinutes: f.frequency,
    rateLimitPerHour: f.rateLimit,
    reliability: f.reliability,
    categories: f.categories,
    locality: f.locality,
  };
}
