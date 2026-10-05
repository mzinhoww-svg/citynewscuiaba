"use client";

import type { ReactNode } from "react";
import { formatMinutes, RELIABILITY_TEXT, scoreText } from "@/content/pt-BR/sources-admin";
import {
  FIELD_TEXT,
  FREQUENCY_FIELD_TEXT,
  WIZARD_TEXT,
} from "@/content/pt-BR/sources-admin-detail";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import type { ActionState } from "@/lib/sources/action-state";
import type { ImagePolicy, Reliability, RepublishPolicy } from "@/lib/sources/types";
import { Button } from "../../ui/Button";
import { DateField } from "../../ui/DateField";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import {
  ActionMessage,
  CheckboxField,
  CriticalBadge,
  JustificationField,
  TextInput,
} from "./fields";
import {
  frequencyGroups,
  IMAGE_POLICY_OPTIONS,
  LAYER_OPTIONS,
  LOCALITY_OPTIONS,
  PRIORITY_OPTIONS,
  RELIABILITY_OPTIONS,
  REPUBLISH_OPTIONS,
} from "./form-options";
import { SuggestionField, type FieldSuggestion } from "./SuggestionField";
import type { WizardFields } from "./wizard-fields";
import { FieldGroup, Panel } from "./WizardSteps";

type Set = <K extends keyof WizardFields>(key: K, value: WizardFields[K]) => void;

export interface ReviewStepProps {
  uid: string;
  fields: WizardFields;
  set: Set;
  suggestions: Record<string, FieldSuggestion | null>;
  fieldErrors: Record<string, string>;
  sections: readonly { slug: string; name: string }[];
  defaultFrequency: number;
  /** Campos que afrouxam o padrão restrito (selo "Mudança crítica"). */
  loosened: readonly string[];
  onFocus: () => void;
}

/** Etapa 3 · Revisão: identificação, classificação, direitos, coleta e importância. */
export function ReviewStep({
  uid,
  fields,
  set,
  suggestions,
  fieldErrors,
  sections,
  defaultFrequency,
  loosened,
  onFocus,
}: ReviewStepProps) {
  const categoryList = sections.map((s) => s.slug).join(", ");
  // O assistente nunca oferece a via rápida (§7.2): ela é escolhida depois, na Configuração.
  const freq = frequencyGroups({
    defaultMinutes: defaultFrequency,
    showFast: false,
    fastDisabledReason: null,
  });
  const criticalAside = (field: string): ReactNode =>
    loosened.includes(field) ? <CriticalBadge>{FIELD_TEXT.critical}</CriticalBadge> : null;

  return (
    <Panel title={WIZARD_TEXT.review.title} id={`${uid}-revisao`} onFocus={onFocus}>
      <p className="type-meta text-meta">{WIZARD_TEXT.review.hint}</p>
      <FieldGroup title={WIZARD_TEXT.review.identification}>
        <SuggestionField
          id={`${uid}-name`}
          name="name"
          label={FIELD_TEXT.name}
          value={fields.name}
          onChange={(v) => set("name", v)}
          suggestion={suggestions.name}
          error={fieldErrors.name}
        />
        <SuggestionField
          id={`${uid}-displayName`}
          name="displayName"
          label={FIELD_TEXT.displayName}
          value={fields.displayName}
          onChange={(v) => set("displayName", v)}
          hint={FIELD_TEXT.displayNameHint}
          error={fieldErrors.displayName}
        />
        <SuggestionField
          id={`${uid}-slug`}
          name="slug"
          label={FIELD_TEXT.slug}
          value={fields.slug}
          onChange={(v) => set("slug", v)}
          suggestion={suggestions.slug}
          error={fieldErrors.slug}
        />
      </FieldGroup>
      <FieldGroup title={WIZARD_TEXT.review.classification}>
        <SuggestionField
          id={`${uid}-layer`}
          name="layer"
          label={FIELD_TEXT.layer}
          value={fields.layer}
          onChange={(v) => set("layer", v)}
          options={LAYER_OPTIONS}
          suggestion={suggestions.layer}
          formatSuggestion={(v) => LAYER_OPTIONS.find((o) => o.value === v)?.label ?? v}
        />
        <SuggestionField
          id={`${uid}-categories`}
          name="categories"
          label={FIELD_TEXT.categories}
          value={fields.categories}
          onChange={(v) => set("categories", v)}
          suggestion={suggestions.categories}
          hint={FIELD_TEXT.categoriesHint(categoryList)}
          error={fieldErrors.categories}
        />
        <SuggestionField
          id={`${uid}-locality`}
          name="locality"
          label={FIELD_TEXT.locality}
          value={fields.locality}
          onChange={(v) => set("locality", v)}
          options={LOCALITY_OPTIONS}
          suggestion={suggestions.locality}
          formatSuggestion={(v) => LOCALITY_TEXT[v] ?? v}
        />
        <SuggestionField
          id={`${uid}-reliability`}
          name="reliability"
          label={FIELD_TEXT.reliability}
          value={fields.reliability}
          onChange={(v) => set("reliability", v as Reliability)}
          options={RELIABILITY_OPTIONS}
          suggestion={suggestions.reliability}
          formatSuggestion={(v) => RELIABILITY_TEXT[v as Reliability] ?? v}
          hint={FIELD_TEXT.criticalStatic}
          aside={criticalAside("reliability")}
        />
      </FieldGroup>
      <FieldGroup title={WIZARD_TEXT.review.rights}>
        <Select
          id={`${uid}-imagePolicy`}
          name="imagePolicy"
          label={FIELD_TEXT.imagePolicy}
          value={fields.imagePolicy}
          onChange={(v) => set("imagePolicy", v as ImagePolicy)}
          options={IMAGE_POLICY_OPTIONS}
          hint={FIELD_TEXT.criticalStatic}
          labelAside={criticalAside("imagePolicy")}
        />
        <Select
          id={`${uid}-republish`}
          name="republishPolicy"
          label={FIELD_TEXT.republishPolicy}
          value={fields.republishPolicy}
          onChange={(v) => set("republishPolicy", v as RepublishPolicy)}
          options={REPUBLISH_OPTIONS}
          hint={FIELD_TEXT.criticalStatic}
          labelAside={criticalAside("republishPolicy")}
        />
        <CheckboxField
          id={`${uid}-sole`}
          label={FIELD_TEXT.maySoleSource}
          checked={fields.maySoleSource}
          onChange={(v) => set("maySoleSource", v)}
          hint={FIELD_TEXT.criticalStatic}
          aside={criticalAside("maySoleSource")}
        />
        <DateField
          id={`${uid}-agreementUntil`}
          name="agreementUntil"
          label={FIELD_TEXT.agreementUntil}
          value={fields.agreementUntil}
          onChange={(v) => set("agreementUntil", v)}
        />
        <TextInput
          id={`${uid}-agreementNote`}
          label={FIELD_TEXT.agreementNote}
          value={fields.agreementNote}
          onChange={(v) => set("agreementNote", v)}
        />
      </FieldGroup>
      {loosened.length > 0 && (
        <JustificationField
          id={`${uid}-justification`}
          value={fields.justification}
          onChange={(v) => set("justification", v)}
          error={fieldErrors.justification}
        />
      )}
      <FieldGroup title={WIZARD_TEXT.review.collection}>
        <SuggestionField
          id={`${uid}-frequency`}
          name="frequencyMinutes"
          label={FREQUENCY_FIELD_TEXT.label}
          value={fields.frequency}
          onChange={(v) => set("frequency", v)}
          options={freq.options}
          groups={freq.groups}
          suggestion={suggestions.frequencyMinutes}
          formatSuggestion={(v) =>
            v === "padrao"
              ? FREQUENCY_FIELD_TEXT.defaultOption(formatMinutes(defaultFrequency))
              : formatMinutes(Number(v))
          }
          hint={FREQUENCY_FIELD_TEXT.newSource}
          error={fieldErrors.frequencyMinutes}
        />
        <SuggestionField
          id={`${uid}-rate`}
          name="rateLimitPerHour"
          label={FIELD_TEXT.rateLimit}
          value={fields.rateLimit}
          onChange={(v) => set("rateLimit", v)}
          suggestion={suggestions.rateLimitPerHour}
          inputMode="numeric"
          hint={FIELD_TEXT.rateLimitHint}
          error={fieldErrors.rateLimitPerHour}
        />
      </FieldGroup>
      <FieldGroup title={WIZARD_TEXT.review.importance}>
        <Select
          id={`${uid}-score`}
          name="editorialScore"
          label={FIELD_TEXT.score}
          value={fields.score}
          onChange={(v) => set("score", v)}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: scoreText(n) }))}
          hint={FIELD_TEXT.scoreHint}
        />
        <Select
          id={`${uid}-priority`}
          name="priority"
          label={FIELD_TEXT.priority}
          value={fields.priority}
          onChange={(v) => set("priority", v)}
          options={PRIORITY_OPTIONS}
        />
      </FieldGroup>
    </Panel>
  );
}

export interface TermsStepProps {
  uid: string;
  termsLinks: readonly string[];
  fields: WizardFields;
  set: Set;
  fieldErrors: Record<string, string>;
  onFocus: () => void;
}

/** Etapa 4 · Termos: robots ok, links de termos achados, URL/intervalo e a confirmação de leitura. */
export function TermsStep({ uid, termsLinks, fields, set, fieldErrors, onFocus }: TermsStepProps) {
  return (
    <Panel title={WIZARD_TEXT.terms.title} id={`${uid}-termos`} onFocus={onFocus}>
      <p className="flex items-start gap-2 type-body text-strong">
        <Icon name="check" size={18} className="mt-0.5 shrink-0 text-service" />
        {WIZARD_TEXT.terms.robotsOk}
      </p>
      {termsLinks.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="type-body text-strong">{WIZARD_TEXT.terms.found}</p>
          <ul className="flex flex-col gap-1">
            {termsLinks.map((href) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-body break-all text-link underline-offset-4 hover:underline"
                >
                  {href}
                  <span className="sr-only"> {WIZARD_TEXT.preview.opensNewTab}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="type-body text-meta">{WIZARD_TEXT.terms.none}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          id={`${uid}-termsUrl`}
          label={FIELD_TEXT.termsUrl}
          type="url"
          value={fields.termsUrl}
          onChange={(v) => set("termsUrl", v)}
          error={fieldErrors.termsUrl}
        />
        <TextInput
          id={`${uid}-termsMin`}
          label={FIELD_TEXT.termsMinInterval}
          inputMode="numeric"
          value={fields.termsMinInterval}
          onChange={(v) => set("termsMinInterval", v)}
          hint={FIELD_TEXT.termsMinIntervalHint}
          error={fieldErrors.termsMinIntervalMinutes}
        />
      </div>
      <CheckboxField
        id={`${uid}-termsReviewed`}
        label={WIZARD_TEXT.terms.checkbox}
        checked={fields.termsReviewed}
        onChange={(v) => set("termsReviewed", v)}
        hint={WIZARD_TEXT.terms.checkboxHint}
      />
    </Panel>
  );
}

export interface SaveStepProps {
  uid: string;
  saving: boolean;
  result: ActionState | null;
  onSave: (activate: boolean) => void;
  onFocus: () => void;
}

/** Etapa 5 · Salvar: pausada ou ativar já (termos revisados não são exigidos, A-127). */
export function SaveStep({ uid, saving, result, onSave, onFocus }: SaveStepProps) {
  return (
    <Panel title={WIZARD_TEXT.save.title} id={`${uid}-salvar`} onFocus={onFocus}>
      <p className="type-body text-meta">{WIZARD_TEXT.save.hint}</p>
      <ActionMessage result={result} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button size="md" onClick={() => onSave(false)} disabled={saving}>
          {saving ? WIZARD_TEXT.save.saving : WIZARD_TEXT.save.paused}
        </Button>
        <Button size="md" variant="outline" onClick={() => onSave(true)} disabled={saving}>
          {WIZARD_TEXT.save.activate}
        </Button>
      </div>
    </Panel>
  );
}
