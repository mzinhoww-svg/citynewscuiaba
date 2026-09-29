"use client";

import { useId, useState, type FormEvent } from "react";
import {
  IMAGE_POLICY_LABEL,
  LAYER_LABEL,
  LOCALITY_LABEL,
  PRIORITY_LABEL,
  RELIABILITY_LABEL,
  REPUBLISH_POLICY_LABEL,
  durationLabel,
} from "@/content/pt-BR/sources-admin";
import { CONFIG, FIELDS, FREQUENCY_FIELD as F } from "@/content/pt-BR/sources-admin-detail";
import { criticalChanges } from "@/lib/sources/critical";
import type { SourceConfig, SourceStatus } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { InlineAlert } from "../../ui/InlineAlert";
import { ActionMessage, formDataOf, useFormAction, type FormAction } from "./detail-shared";
import { SuggestionField, type FieldSuggestion } from "./SuggestionField";

/** Frequência como o painel mostra (espelha `FrequencyView` de `queries/sources-admin`). */
export interface FrequencyInfo {
  chosen: number | null;
  effective: number;
  raisedBy: "robots" | "terms" | null;
  lane: "fast" | "normal";
  defaultMinutes: number;
}

export interface FastLaneInfo {
  used: number;
  max: number;
}

export interface ConfigSuggestions {
  name?: FieldSuggestion;
  slug?: FieldSuggestion;
  categories?: FieldSuggestion;
  locality?: FieldSuggestion;
  reliability?: FieldSuggestion;
  layer?: FieldSuggestion;
  frequency?: FieldSuggestion;
  rateLimitPerHour?: FieldSuggestion;
}

export interface SourceConfigFieldsProps {
  mode: "create" | "edit";
  /** Valores iniciais; na criação, o piso restritivo (nada que amplie direitos). */
  initial: SourceConfig;
  /** Editorias existentes (slug e nome). */
  sections: readonly { slug: string; label: string }[];
  status: SourceStatus;
  fastLane: FastLaneInfo;
  /** Só na edição: frequência efetiva e próxima coleta. */
  frequency?: FrequencyInfo | null;
  nextCollectionAt?: string | null;
  slug?: string;
  suggestions?: ConfigSuggestions;
  fieldErrors?: Record<string, string> | undefined;
  readOnly?: boolean;
  termsReviewedAt?: string | null;
  /** Só leitura: seletores de página da fonte. */
  pageSelectors?: string | null;
  /** Campos de endereço e tipo (edição). */
  address?: { baseUrl: string; feedUrl: string | null; kind: string } | null;
}

const options = <K extends string | number>(labels: Record<K, string>) =>
  (Object.keys(labels) as unknown as K[]).map((k) => ({
    value: String(k),
    label: String(labels[k]),
  }));

const SCORE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} de 5` }));
const LAYER_OPTIONS = [
  { value: "", label: FIELDS.layerNone },
  ...options(LAYER_LABEL as Record<number, string>),
];
const NORMAL_GRID = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Cuiaba",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Campos da fonte agrupados como na spec §7.2: Identificação, Classificação, Direitos, Coleta e
 * Importância. Campos que ampliam direitos levam o selo "Exige segunda aprovação"; quando um deles
 * muda, aparece a justificativa (`justification`). Serve à edição e ao passo Revisão do assistente
 * (nome dos campos em `src/lib/sources/form.ts`).
 */
export function SourceConfigFields({
  mode,
  initial,
  sections,
  status,
  fastLane,
  frequency,
  nextCollectionAt,
  slug,
  suggestions,
  fieldErrors,
  readOnly = false,
  termsReviewedAt,
  pageSelectors,
  address,
}: SourceConfigFieldsProps) {
  const uid = useId();
  const err = fieldErrors ?? {};
  const [crit, setCrit] = useState({
    imagePolicy: initial.imagePolicy,
    republishPolicy: initial.republishPolicy,
    reliability: initial.reliability,
    maySoleSource: initial.maySoleSource,
  });
  const critical = criticalChanges(initial, { ...initial, ...crit });
  const ruleFreq = suggestions?.frequency;
  const [freq, setFreq] = useState<string>(
    initial.frequencyMinutes !== null
      ? String(initial.frequencyMinutes)
      : ruleFreq && typeof ruleFreq.value === "number"
        ? String(ruleFreq.value)
        : "default",
  );
  const [rate, setRate] = useState(String(initial.rateLimitPerHour));

  // Via rápida: quem já está nela troca livremente; entrar exige fonte ativa e vaga.
  const alreadyFast = initial.frequencyMinutes !== null && initial.frequencyMinutes < 30;
  const activeNow = status === "active" || status === "degraded";
  const laneOpen = fastLane.used < fastLane.max;
  const canFast = mode === "edit" && (alreadyFast || (activeNow && laneOpen));
  const fastReason = canFast
    ? null
    : mode === "create"
      ? F.fastNewSource
      : !activeNow
        ? F.fastInactive
        : F.fastFull(fastLane.used, fastLane.max);
  const defaultMinutes = frequency?.defaultMinutes ?? 30;
  const chosenMinutes = freq === "default" ? defaultMinutes : Number(freq);
  const unchanged =
    freq === (initial.frequencyMinutes === null ? "default" : String(initial.frequencyMinutes));
  const effective = frequency && unchanged ? frequency.effective : chosenMinutes;
  const requestsPerHour = (60 / Math.max(effective, 1)) * 2;
  const rateNumber = Number(rate);
  const rateWarn = Number.isFinite(rateNumber) && rateNumber > 0 && rateNumber < requestsPerHour;
  const next = nextCollectionAt ? clock.format(new Date(nextCollectionAt)) : null;

  const sectionHint = FIELDS.categoriesHint(sections.map((s) => s.slug).join(", "));

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-4" disabled={readOnly}>
        <legend className="mb-2 type-section text-strong">{FIELDS.identity}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <SuggestionField
            name="name"
            label={FIELDS.name}
            defaultValue={initial.name}
            {...(suggestions?.name ? { suggestion: suggestions.name } : {})}
            error={err.name}
            readOnly={readOnly}
            maxLength={120}
          />
          {mode === "create" ? (
            <SuggestionField
              name="slug"
              label={FIELDS.slug}
              defaultValue={slug ?? ""}
              {...(suggestions?.slug ? { suggestion: suggestions.slug } : {})}
              hint={FIELDS.slugHint}
              error={err.slug}
              maxLength={60}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="type-label text-16 text-strong">{FIELDS.slug}</span>
              <p className="flex h-input items-center rounded-lg bg-section px-4 type-body text-strong">
                {slug}
              </p>
              <p className="type-meta text-meta">{FIELDS.slugHint}</p>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={readOnly}>
        <legend className="mb-2 type-section text-strong">{FIELDS.classification}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <SuggestionField
            name="layer"
            label={FIELDS.layer}
            kind="select"
            options={LAYER_OPTIONS}
            defaultValue={initial.layer === null ? "" : String(initial.layer)}
            {...(suggestions?.layer ? { suggestion: suggestions.layer } : {})}
            error={err.layer}
            readOnly={readOnly}
          />
          <SuggestionField
            name="locality"
            label={FIELDS.locality}
            kind="select"
            options={options(LOCALITY_LABEL)}
            defaultValue={initial.locality}
            {...(suggestions?.locality ? { suggestion: suggestions.locality } : {})}
            error={err.locality}
            readOnly={readOnly}
          />
          <SuggestionField
            name="categories"
            label={FIELDS.categories}
            defaultValue={initial.categories.join(", ")}
            {...(suggestions?.categories ? { suggestion: suggestions.categories } : {})}
            hint={sectionHint}
            error={err.categories}
            readOnly={readOnly}
            className="md:col-span-2"
          />
          <input type="hidden" name="categoriesPresent" value="1" />
          <SuggestionField
            name="reliability"
            label={FIELDS.reliability}
            kind="select"
            options={options(RELIABILITY_LABEL)}
            defaultValue={initial.reliability}
            {...(suggestions?.reliability ? { suggestion: suggestions.reliability } : {})}
            critical
            error={err.reliability}
            readOnly={readOnly}
            onValueChange={(v) =>
              setCrit((c) => ({ ...c, reliability: v as SourceConfig["reliability"] }))
            }
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={readOnly}>
        <legend className="mb-2 type-section text-strong">{FIELDS.rights}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <SuggestionField
            name="imagePolicy"
            label={FIELDS.imagePolicy}
            kind="select"
            options={options(IMAGE_POLICY_LABEL)}
            defaultValue={initial.imagePolicy}
            critical
            error={err.imagePolicy}
            readOnly={readOnly}
            onValueChange={(v) =>
              setCrit((c) => ({ ...c, imagePolicy: v as SourceConfig["imagePolicy"] }))
            }
          />
          <SuggestionField
            name="republishPolicy"
            label={FIELDS.republishPolicy}
            kind="select"
            options={options(REPUBLISH_POLICY_LABEL)}
            defaultValue={initial.republishPolicy}
            critical
            error={err.republishPolicy}
            readOnly={readOnly}
            onValueChange={(v) =>
              setCrit((c) => ({ ...c, republishPolicy: v as SourceConfig["republishPolicy"] }))
            }
          />
          <div className="flex flex-col gap-2 md:col-span-2">
            <input type="hidden" name="maySoleSource" value="false" />
            <label className="flex min-h-tap items-center gap-3 type-body text-strong">
              <input
                type="checkbox"
                name="maySoleSource"
                value="true"
                defaultChecked={initial.maySoleSource}
                disabled={readOnly}
                onChange={(e) => setCrit((c) => ({ ...c, maySoleSource: e.target.checked }))}
                className="size-5 accent-(--action-primary)"
              />
              {FIELDS.maySoleSource}
              <span className="inline-flex items-center gap-1 type-meta font-semibold text-warn">
                <Icon name="lock" size={14} />
                {FIELDS.critical}
              </span>
            </label>
          </div>
          <SuggestionField
            name="agreementUntil"
            label={FIELDS.agreementUntil}
            defaultValue={initial.agreementUntil ?? ""}
            placeholder="AAAA-MM-DD"
            error={err.agreementUntil}
            readOnly={readOnly}
          />
          <SuggestionField
            name="agreementNote"
            label={FIELDS.agreementNote}
            defaultValue={initial.agreementNote ?? ""}
            error={err.agreementNote}
            readOnly={readOnly}
            maxLength={500}
          />
          <SuggestionField
            name="termsUrl"
            label={FIELDS.termsUrl}
            defaultValue={initial.termsUrl ?? ""}
            inputMode="url"
            error={err.termsUrl}
            readOnly={readOnly}
            className="md:col-span-2"
          />
          {mode === "edit" && (
            <div className="flex flex-col gap-1 md:col-span-2">
              <input type="hidden" name="termsReviewed" value="false" />
              <label className="flex min-h-tap items-center gap-3 type-body text-strong">
                <input
                  type="checkbox"
                  name="termsReviewed"
                  value="true"
                  defaultChecked={Boolean(termsReviewedAt)}
                  disabled={readOnly}
                  className="size-5 accent-(--action-primary)"
                />
                {FIELDS.termsReviewed}
              </label>
              {termsReviewedAt && (
                <p className="type-meta text-meta">
                  {FIELDS.termsReviewedOn(
                    new Date(termsReviewedAt).toLocaleDateString("pt-BR", {
                      timeZone: "America/Cuiaba",
                    }),
                  )}
                </p>
              )}
            </div>
          )}
        </div>
        {critical.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-line-section bg-atencao-soft p-4">
            <p className="flex items-start gap-2 type-body font-semibold text-strong">
              <Icon name="triangle-alert" size={18} className="mt-1 shrink-0 text-warn" />
              {FIELDS.approvalHint(critical.length)}
            </p>
            <p className="type-meta text-meta">{FIELDS.criticalHint}</p>
            <label htmlFor={`${uid}-just`} className="type-label text-16 text-strong">
              {FIELDS.justification}
            </label>
            <textarea
              id={`${uid}-just`}
              name="justification"
              rows={3}
              maxLength={500}
              aria-describedby={`${uid}-just-dica`}
              aria-invalid={err.justification ? true : undefined}
              className={cx(
                "border-control control-field w-full rounded-lg bg-input px-4 py-3 type-body text-strong",
                err.justification && "field-error",
              )}
            />
            <p id={`${uid}-just-dica`} className="type-meta text-meta">
              {FIELDS.justificationHint}
            </p>
            {err.justification && (
              <p className="flex items-start gap-1.5 type-meta text-danger">
                <Icon name="circle-alert" size={16} />
                {err.justification}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={readOnly}>
        <legend className="mb-2 type-section text-strong">{FIELDS.collection}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          {address && (
            <>
              <SuggestionField
                name="baseUrl"
                label={FIELDS.baseUrl}
                defaultValue={address.baseUrl}
                inputMode="url"
                error={err.baseUrl}
                readOnly={readOnly}
              />
              <SuggestionField
                name="feedUrl"
                label={FIELDS.feedUrl}
                defaultValue={address.feedUrl ?? ""}
                inputMode="url"
                error={err.feedUrl}
                readOnly={readOnly}
              />
              <SuggestionField
                name="kind"
                label={FIELDS.kind}
                kind="select"
                options={options(FIELDS.kindValue)}
                defaultValue={address.kind}
                error={err.kind}
                readOnly={readOnly}
              />
              <div className="flex flex-col gap-2">
                <span className="type-label text-16 text-strong">{FIELDS.selectors}</span>
                <p className="flex min-h-input items-center rounded-lg bg-section px-4 py-2 type-meta text-strong break-all">
                  {pageSelectors ?? "—"}
                </p>
              </div>
            </>
          )}
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <label htmlFor={`${uid}-freq`} className="type-label text-16 text-strong">
                {FIELDS.frequency}
              </label>
              {mode === "create" && ruleFreq && (
                <span className="inline-flex items-center gap-1 rounded-pill border border-line-section bg-section px-2 py-0.5 type-meta font-semibold text-strong">
                  <Icon name="check" size={14} />
                  {FIELDS.suggestionRule}
                </span>
              )}
            </div>
            <div className="relative">
              <select
                id={`${uid}-freq`}
                name="frequencyMinutes"
                value={freq}
                disabled={readOnly}
                onChange={(e) => setFreq(e.target.value)}
                aria-describedby={`${uid}-freq-ajuda`}
                aria-invalid={err.frequencyMinutes ? true : undefined}
                className={cx(
                  "border-control h-input w-full cursor-pointer appearance-none rounded-lg bg-input pr-11 pl-4 type-body text-strong disabled:cursor-not-allowed disabled:opacity-60",
                  err.frequencyMinutes && "field-error",
                )}
              >
                <option value="default">{F.defaultOption(defaultMinutes)}</option>
                <optgroup label={F.fastGroup}>
                  {[10, 15, 20].map((m) => (
                    <option key={m} value={m} disabled={!canFast}>
                      {m} min
                    </option>
                  ))}
                </optgroup>
                <optgroup label={F.normalGroup}>
                  {NORMAL_GRID.map((m) => (
                    <option key={m} value={m}>
                      {durationLabel(m)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <Icon
                name="chevron-down"
                size={20}
                className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
              />
            </div>
            <div id={`${uid}-freq-ajuda`} className="flex flex-col gap-1 type-meta text-meta">
              <p>{F.help}</p>
              {fastReason && (
                <p className="flex items-start gap-1.5 text-strong">
                  <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
                  {fastReason}
                </p>
              )}
              {freq === "15" && <p>{F.fifteen}</p>}
              {mode === "edit" && frequency && (
                <p className="text-strong">
                  {frequency.raisedBy
                    ? F.effective(frequency.effective, frequency.raisedBy)
                    : frequency.lane === "fast"
                      ? F.effectiveFast(frequency.effective)
                      : `Frequência efetiva: ${durationLabel(frequency.effective)}.`}
                </p>
              )}
              {mode === "edit" &&
                frequency &&
                frequency.chosen !== null &&
                frequency.chosen < 30 &&
                frequency.lane === "normal" && <p>{F.fastButSlow}</p>}
              {mode === "edit" && <p className="text-strong">{next ? F.next(next) : F.noNext}</p>}
              {rateWarn && (
                <p className="flex items-start gap-1.5 text-warn">
                  <Icon name="triangle-alert" size={14} className="mt-0.5 shrink-0" />
                  {F.rateWarn(rateNumber)}
                </p>
              )}
              {err.frequencyMinutes && (
                <p className="flex items-start gap-1.5 text-danger">
                  <Icon name="circle-alert" size={16} />
                  {err.frequencyMinutes}
                </p>
              )}
            </div>
          </div>
          <SuggestionField
            name="rateLimitPerHour"
            label={FIELDS.rateLimit}
            kind="number"
            defaultValue={String(initial.rateLimitPerHour)}
            {...(suggestions?.rateLimitPerHour ? { suggestion: suggestions.rateLimitPerHour } : {})}
            error={err.rateLimitPerHour}
            readOnly={readOnly}
            onValueChange={setRate}
          />
          <SuggestionField
            name="termsMinIntervalMinutes"
            label={FIELDS.termsMinInterval}
            kind="number"
            defaultValue={
              initial.termsMinIntervalMinutes === null
                ? ""
                : String(initial.termsMinIntervalMinutes)
            }
            error={err.termsMinIntervalMinutes}
            readOnly={readOnly}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={readOnly}>
        <legend className="mb-2 type-section text-strong">{FIELDS.importance}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <SuggestionField
            name="editorialScore"
            label={FIELDS.score}
            kind="select"
            options={SCORE_OPTIONS}
            defaultValue={String(initial.editorialScore)}
            hint={FIELDS.scoreHint}
            error={err.editorialScore}
            readOnly={readOnly}
          />
          <SuggestionField
            name="priority"
            label={FIELDS.priority}
            kind="select"
            options={options(PRIORITY_LABEL)}
            defaultValue={String(initial.priority)}
            error={err.priority}
            readOnly={readOnly}
          />
        </div>
      </fieldset>
    </div>
  );
}

export interface SourceConfigFormProps {
  id: string;
  version: number;
  config: SourceConfig;
  slug: string;
  status: SourceStatus;
  archived: boolean;
  sections: readonly { slug: string; label: string }[];
  fastLane: FastLaneInfo;
  frequency: FrequencyInfo;
  nextCollectionAt: string | null;
  termsReviewedAt: string | null;
  address: { baseUrl: string; feedUrl: string | null; kind: string };
  pageSelectors: string | null;
  /** `updateSourceAction`. */
  action: FormAction;
}

/**
 * Aba Configuração (O04): formulário completo da fonte com versão otimista. Sucesso em `status`,
 * erro com o campo destacado e o texto mantido, conflito de versão com "Recarregar". Fonte
 * arquivada abre em leitura.
 */
export function SourceConfigForm({
  id,
  version,
  config,
  slug,
  status,
  archived,
  sections,
  fastLane,
  frequency,
  nextCollectionAt,
  termsReviewedAt,
  address,
  pageSelectors,
  action,
}: SourceConfigFormProps) {
  const { state, pending, submit } = useFormAction(action);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (archived || pending) return;
    submit(formDataOf(e.currentTarget));
  };
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
      aria-labelledby="config-titulo"
    >
      <h2 id="config-titulo" className="sr-only">
        {CONFIG.title}
      </h2>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      {archived && (
        <InlineAlert tone="info" role="none">
          {FIELDS.readOnly}
        </InlineAlert>
      )}
      <SourceConfigFields
        mode="edit"
        initial={config}
        sections={sections}
        status={status}
        fastLane={fastLane}
        frequency={frequency}
        nextCollectionAt={nextCollectionAt}
        slug={slug}
        readOnly={archived}
        termsReviewedAt={termsReviewedAt}
        pageSelectors={pageSelectors}
        address={address}
        fieldErrors={state && !state.ok ? state.fieldErrors : undefined}
      />
      <ActionMessage state={state} />
      {!archived && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="md" disabled={pending}>
            {pending ? FIELDS.saving : FIELDS.save}
          </Button>
        </div>
      )}
    </form>
  );
}
