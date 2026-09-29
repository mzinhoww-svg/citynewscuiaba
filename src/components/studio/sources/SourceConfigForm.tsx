"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  clockTime,
  formatMinutes,
  fullDateTime,
  scoreText,
  SOURCE_ACTION_TEXT,
} from "@/content/pt-BR/sources-admin";
import {
  DETAIL_TEXT,
  FIELD_TEXT,
  FREQUENCY_FIELD_TEXT,
  STRATEGY_TEXT,
  WIZARD_TEXT,
} from "@/content/pt-BR/sources-admin-detail";
import { effectiveFrequency, nextCollectionAt } from "@/lib/sources/frequency";
import type {
  ConsumptionStrategy,
  ImagePolicy,
  Reliability,
  RepublishPolicy,
  SourceConfig,
  SourceStatus,
} from "@/lib/sources/types";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import type { WizardAction, WizardActionResult } from "./AddSourceWizard";
import {
  ActionMessage,
  CheckboxField,
  CriticalBadge,
  FieldShell,
  JustificationField,
  NativeSelect,
  TextInput,
} from "./fields";
import {
  frequencyGroups,
  IMAGE_POLICY_OPTIONS,
  LAYER_OPTIONS,
  LOCALITY_OPTIONS,
  looseningFields,
  PRIORITY_OPTIONS,
  RELIABILITY_OPTIONS,
  REPUBLISH_OPTIONS,
  STRATEGY_VALUES,
  type RightsFields,
} from "./form-options";

export interface SourceConfigFormProps {
  source: {
    id: string;
    version: number;
    config: SourceConfig;
    status: SourceStatus;
    archived: boolean;
    lastFetchedAt: string | null;
    /** `consumption.robots.crawlDelaySec` gravado pelo servidor (eleva a frequência efetiva). */
    crawlDelaySec: number | null;
    termsReviewedAt: string | null;
    ownerName: string | null;
  };
  defaultFrequency: number;
  fastLane: { used: number; max: number };
  sections: readonly { slug: string; name: string }[];
  /** `updateSourceAction` (FS-T6). */
  action: WizardAction;
  /** Relógio da prévia de próxima coleta (testes). */
  now?: Date;
}

interface Values {
  name: string;
  displayName: string;
  layer: string;
  categories: string;
  locality: string;
  reliability: Reliability;
  imagePolicy: ImagePolicy;
  republishPolicy: RepublishPolicy;
  maySoleSource: boolean;
  agreementUntil: string;
  agreementNote: string;
  termsUrl: string;
  strategy: ConsumptionStrategy;
  feedUrl: string;
  pageSelectors: string;
  frequency: string;
  rateLimit: string;
  termsMinInterval: string;
  score: string;
  priority: string;
}

function valuesOf(c: SourceConfig): Values {
  return {
    name: c.name,
    displayName: c.displayName ?? "",
    layer: c.layer === null ? "" : String(c.layer),
    categories: c.categories.join(", "),
    locality: c.locality,
    reliability: c.reliability,
    imagePolicy: c.imagePolicy,
    republishPolicy: c.republishPolicy,
    maySoleSource: c.maySoleSource,
    agreementUntil: c.agreementUntil ?? "",
    agreementNote: c.agreementNote ?? "",
    termsUrl: c.termsUrl ?? "",
    strategy: c.strategy,
    feedUrl: c.feedUrl ?? "",
    pageSelectors: c.pageSelectors ? JSON.stringify(c.pageSelectors) : "",
    frequency: c.frequencyMinutes === null ? "padrao" : String(c.frequencyMinutes),
    rateLimit: String(c.rateLimitPerHour),
    termsMinInterval: c.termsMinIntervalMinutes === null ? "" : String(c.termsMinIntervalMinutes),
    score: String(c.editorialScore),
    priority: String(c.priority),
  };
}

const rightsOf = (v: Values): RightsFields => ({
  imagePolicy: v.imagePolicy,
  republishPolicy: v.republishPolicy,
  reliability: v.reliability,
  maySoleSource: v.maySoleSource,
});

const FAST_LANE_LIMIT = 30;
const CONFLICT_MARK = "Recarregue";

/**
 * Aba Configuração da fonte (spec §7.2): Identificação, Classificação, Direitos, Coleta e
 * Importância. Campos críticos têm a regra à vista ("Afrouxar exige segunda aprovação") e, quando
 * a edição afrouxa, o selo "Exige segunda aprovação" e o campo de justificativa; restringir aplica
 * na hora (D-F3). O campo Frequência separa "Via rápida" e "Ciclo normal", desabilita a via rápida
 * com o motivo em texto e mostra a frequência efetiva e a próxima coleta prevista (§7.8).
 * Conflito de versão mostra "Recarregar"; fonte arquivada abre em modo leitura.
 */
export function SourceConfigForm({
  source,
  defaultFrequency,
  fastLane,
  sections,
  action,
  now,
}: SourceConfigFormProps) {
  const uid = useId().replace(/:/g, "");
  const [baseline, setBaseline] = useState<Values>(() => valuesOf(source.config));
  const [values, setValues] = useState<Values>(baseline);
  const [version, setVersion] = useState(source.version);
  const [justification, setJustification] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WizardActionResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const readOnly = source.archived;

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const loosened = looseningFields(rightsOf(baseline), rightsOf(values));
  const criticalAside = (field: string) =>
    loosened.includes(field) ? <CriticalBadge>{FIELD_TEXT.critical}</CriticalBadge> : null;

  // Frequência (§7.2, §7.8)
  const active = source.status === "active" || source.status === "degraded";
  const alreadyFast =
    source.config.frequencyMinutes !== null && source.config.frequencyMinutes < FAST_LANE_LIMIT;
  const fastDisabledReason = !active
    ? FREQUENCY_FIELD_TEXT.inactive
    : !alreadyFast && fastLane.used >= fastLane.max
      ? FREQUENCY_FIELD_TEXT.full(fastLane.used, fastLane.max)
      : null;
  const freq = frequencyGroups({
    defaultMinutes: defaultFrequency,
    showFast: true,
    fastDisabledReason,
  });
  const chosen = values.frequency === "padrao" ? null : Number(values.frequency);
  const termsMin = /^\d+$/.test(values.termsMinInterval) ? Number(values.termsMinInterval) : null;
  const effective = effectiveFrequency(chosen, defaultFrequency, {
    crawlDelaySec: source.crawlDelaySec,
    termsMinIntervalMinutes: termsMin,
  });
  const next = nextCollectionAt(
    {
      status: source.status,
      lastFetchedAt: source.lastFetchedAt,
      frequencyMinutes: effective.minutes,
    },
    now ?? new Date(),
  );
  const rate = Number(values.rateLimit);
  const requestsPerHour = (60 / effective.minutes) * 2;
  const freqNotes: string[] = [];
  if (fastDisabledReason) freqNotes.push(fastDisabledReason);
  if (effective.raisedBy) {
    freqNotes.push(
      chosen !== null && chosen < FAST_LANE_LIMIT && effective.minutes >= FAST_LANE_LIMIT
        ? FREQUENCY_FIELD_TEXT.fastButSlowed(formatMinutes(effective.minutes), effective.raisedBy)
        : FREQUENCY_FIELD_TEXT.effective(formatMinutes(effective.minutes), effective.raisedBy),
    );
  }
  if (effective.minutes === 15) freqNotes.push(FREQUENCY_FIELD_TEXT.grid15);
  if (Number.isFinite(rate) && rate > 0 && rate < requestsPerHour)
    freqNotes.push(FREQUENCY_FIELD_TEXT.rateWarning(rate));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (loosened.length > 0 && !justification.trim()) {
      setErrors({ justification: SOURCE_ACTION_TEXT.justificationRequired });
      setResult({ ok: false, message: SOURCE_ACTION_TEXT.justificationRequired });
      return;
    }
    const form = new FormData();
    form.set("id", source.id);
    form.set("version", String(version));
    form.set("name", values.name);
    form.set("displayName", values.displayName);
    form.set("layer", values.layer);
    form.set("categories", values.categories);
    form.set("locality", values.locality);
    form.set("reliability", values.reliability);
    form.set("imagePolicy", values.imagePolicy);
    form.set("republishPolicy", values.republishPolicy);
    form.set("maySoleSource", values.maySoleSource ? "true" : "false");
    form.set("agreementUntil", values.agreementUntil);
    form.set("agreementNote", values.agreementNote);
    form.set("termsUrl", values.termsUrl);
    form.set("strategy", values.strategy);
    form.set("feedUrl", values.feedUrl);
    form.set("pageSelectors", values.pageSelectors);
    form.set("frequencyMinutes", values.frequency);
    form.set("rateLimitPerHour", values.rateLimit);
    form.set("termsMinIntervalMinutes", values.termsMinInterval);
    form.set("editorialScore", values.score);
    form.set("priority", values.priority);
    if (loosened.length > 0) form.set("justification", justification.trim());
    if (reason.trim()) form.set("reason", reason.trim());

    setSaving(true);
    setResult(null);
    let r: WizardActionResult;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setSaving(false);
    setResult(r);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return;
    }
    setErrors({});
    const data = (r.data ?? {}) as { version?: number };
    if (typeof data.version === "number") setVersion(data.version);
    // Campos que afrouxam só mudam depois da segunda aprovação: voltam ao valor gravado.
    const saved: Values = { ...values };
    for (const f of loosened) {
      const k = f as keyof RightsFields;
      (saved as unknown as Record<string, unknown>)[k] = baseline[k];
    }
    setBaseline(saved);
    setValues(saved);
    setJustification("");
    setReason("");
  }

  const conflict = result && !result.ok && result.message.includes(CONFLICT_MARK);
  const id = (k: string) => `${uid}-${k}`;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-6 border-0 p-0">
        <Section title={WIZARD_TEXT.review.identification}>
          <TextInput
            id={id("name")}
            label={FIELD_TEXT.name}
            value={values.name}
            onChange={(v) => set("name", v)}
            error={errors.name}
          />
          <TextInput
            id={id("displayName")}
            label={FIELD_TEXT.displayName}
            value={values.displayName}
            onChange={(v) => set("displayName", v)}
            hint={FIELD_TEXT.displayNameHint}
            error={errors.displayName}
          />
          <TextInput
            id={id("slug")}
            label={FIELD_TEXT.slug}
            value={source.config.slug}
            onChange={() => undefined}
            hint={FIELD_TEXT.slugReadOnly}
            disabled
          />
          <div className="flex flex-col gap-2">
            <p className="type-label text-16 text-strong">{FIELD_TEXT.owner}</p>
            <p className="type-body text-meta">{source.ownerName ?? FIELD_TEXT.ownerNone}</p>
          </div>
        </Section>

        <Section title={WIZARD_TEXT.review.classification}>
          <FieldShell id={id("layer")} label={FIELD_TEXT.layer}>
            <NativeSelect
              id={id("layer")}
              name="layer"
              value={values.layer}
              onChange={(v) => set("layer", v)}
              options={[{ value: "", label: FIELD_TEXT.layerNone }, ...LAYER_OPTIONS]}
            />
          </FieldShell>
          <TextInput
            id={id("categories")}
            label={FIELD_TEXT.categories}
            value={values.categories}
            onChange={(v) => set("categories", v)}
            hint={FIELD_TEXT.categoriesHint(sections.map((s) => s.slug).join(", "))}
            error={errors.categories}
          />
          <FieldShell id={id("locality")} label={FIELD_TEXT.locality}>
            <NativeSelect
              id={id("locality")}
              name="locality"
              value={values.locality}
              onChange={(v) => set("locality", v)}
              options={LOCALITY_OPTIONS}
            />
          </FieldShell>
          <FieldShell
            id={id("reliability")}
            label={FIELD_TEXT.reliability}
            hint={FIELD_TEXT.criticalStatic}
            aside={criticalAside("reliability")}
          >
            <NativeSelect
              id={id("reliability")}
              name="reliability"
              value={values.reliability}
              onChange={(v) => set("reliability", v as Reliability)}
              options={RELIABILITY_OPTIONS}
              hint={FIELD_TEXT.criticalStatic}
            />
          </FieldShell>
        </Section>

        <Section title={WIZARD_TEXT.review.rights}>
          <FieldShell
            id={id("imagePolicy")}
            label={FIELD_TEXT.imagePolicy}
            hint={FIELD_TEXT.criticalStatic}
            aside={criticalAside("imagePolicy")}
          >
            <NativeSelect
              id={id("imagePolicy")}
              name="imagePolicy"
              value={values.imagePolicy}
              onChange={(v) => set("imagePolicy", v as ImagePolicy)}
              options={IMAGE_POLICY_OPTIONS}
              hint={FIELD_TEXT.criticalStatic}
            />
          </FieldShell>
          <FieldShell
            id={id("republish")}
            label={FIELD_TEXT.republishPolicy}
            hint={FIELD_TEXT.criticalStatic}
            aside={criticalAside("republishPolicy")}
          >
            <NativeSelect
              id={id("republish")}
              name="republishPolicy"
              value={values.republishPolicy}
              onChange={(v) => set("republishPolicy", v as RepublishPolicy)}
              options={REPUBLISH_OPTIONS}
              hint={FIELD_TEXT.criticalStatic}
            />
          </FieldShell>
          <CheckboxField
            id={id("sole")}
            label={FIELD_TEXT.maySoleSource}
            checked={values.maySoleSource}
            onChange={(v) => set("maySoleSource", v)}
            hint={FIELD_TEXT.criticalStatic}
            aside={criticalAside("maySoleSource")}
          />
          <TextInput
            id={id("agreementUntil")}
            label={FIELD_TEXT.agreementUntil}
            type="date"
            value={values.agreementUntil}
            onChange={(v) => set("agreementUntil", v)}
          />
          <TextInput
            id={id("agreementNote")}
            label={FIELD_TEXT.agreementNote}
            value={values.agreementNote}
            onChange={(v) => set("agreementNote", v)}
          />
          <TextInput
            id={id("termsUrl")}
            label={FIELD_TEXT.termsUrl}
            type="url"
            value={values.termsUrl}
            onChange={(v) => set("termsUrl", v)}
            hint={
              source.termsReviewedAt
                ? FIELD_TEXT.termsReviewed(fullDateTime(source.termsReviewedAt))
                : FIELD_TEXT.termsNotReviewed
            }
            error={errors.termsUrl}
          />
        </Section>
        {loosened.length > 0 && (
          <JustificationField
            id={id("justification")}
            value={justification}
            onChange={setJustification}
            error={errors.justification}
          />
        )}

        <Section title={WIZARD_TEXT.review.collection}>
          <FieldShell id={id("strategy")} label={FIELD_TEXT.strategy}>
            <NativeSelect
              id={id("strategy")}
              name="strategy"
              value={values.strategy}
              onChange={(v) => set("strategy", v as ConsumptionStrategy)}
              options={STRATEGY_VALUES.map((s) => ({ value: s, label: STRATEGY_TEXT[s] }))}
            />
          </FieldShell>
          <TextInput
            id={id("feedUrl")}
            label={FIELD_TEXT.feedUrl}
            type="url"
            value={values.feedUrl}
            onChange={(v) => set("feedUrl", v)}
            error={errors.feedUrl}
          />
          {(values.strategy === "page_list" || values.pageSelectors) && (
            <TextInput
              id={id("selectors")}
              label={FIELD_TEXT.pageSelectors}
              value={values.pageSelectors}
              onChange={(v) => set("pageSelectors", v)}
              hint={FIELD_TEXT.pageSelectorsHint}
              error={errors.pageSelectors}
            />
          )}
          <FieldShell
            id={id("frequency")}
            label={FREQUENCY_FIELD_TEXT.label}
            hint={FREQUENCY_FIELD_TEXT.help}
            error={errors.frequencyMinutes}
            className="md:col-span-2"
          >
            <NativeSelect
              id={id("frequency")}
              name="frequencyMinutes"
              value={values.frequency}
              onChange={(v) => set("frequency", v)}
              options={freq.options}
              groups={freq.groups}
              hint={FREQUENCY_FIELD_TEXT.help}
              error={errors.frequencyMinutes}
            />
            <div
              aria-live="polite"
              className="flex flex-col gap-1 rounded-md bg-section px-3 py-2 type-meta text-strong"
            >
              {freqNotes.map((n) => (
                <p key={n}>{n}</p>
              ))}
              <p suppressHydrationWarning className="font-semibold">
                {next ? FREQUENCY_FIELD_TEXT.next(clockTime(next)) : FREQUENCY_FIELD_TEXT.noNext}
              </p>
              <p className="text-meta">{FREQUENCY_FIELD_TEXT.lane(fastLane.used, fastLane.max)}</p>
            </div>
          </FieldShell>
          <TextInput
            id={id("rate")}
            label={FIELD_TEXT.rateLimit}
            inputMode="numeric"
            value={values.rateLimit}
            onChange={(v) => set("rateLimit", v)}
            hint={FIELD_TEXT.rateLimitHint}
            error={errors.rateLimitPerHour}
          />
          <TextInput
            id={id("termsMin")}
            label={FIELD_TEXT.termsMinInterval}
            inputMode="numeric"
            value={values.termsMinInterval}
            onChange={(v) => set("termsMinInterval", v)}
            hint={FIELD_TEXT.termsMinIntervalHint}
            error={errors.termsMinIntervalMinutes}
          />
        </Section>

        <Section title={WIZARD_TEXT.review.importance}>
          <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 type-label text-16 text-strong">{FIELD_TEXT.score}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={cx(
                    "flex min-h-tap min-w-tap cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 type-body",
                    values.score === String(n)
                      ? "border-line-strong bg-inverse font-semibold text-on-inverse"
                      : "border-line-control bg-card-white text-strong",
                  )}
                >
                  <input
                    type="radio"
                    name={`${uid}-score`}
                    value={n}
                    checked={values.score === String(n)}
                    onChange={() => set("score", String(n))}
                    className="sr-only"
                  />
                  {scoreText(n)}
                </label>
              ))}
            </div>
            <p className="type-meta text-meta">{FIELD_TEXT.scoreHint}</p>
          </fieldset>
          <FieldShell id={id("priority")} label={FIELD_TEXT.priority}>
            <NativeSelect
              id={id("priority")}
              name="priority"
              value={values.priority}
              onChange={(v) => set("priority", v)}
              options={PRIORITY_OPTIONS}
            />
          </FieldShell>
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-col gap-4">
          <TextInput
            id={id("reason")}
            label={FIELD_TEXT.reason}
            value={reason}
            onChange={setReason}
          />
          <ActionMessage result={result}>
            {conflict && (
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                {DETAIL_TEXT.actions.reload}
              </Button>
            )}
          </ActionMessage>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="md" disabled={saving}>
              {saving ? FIELD_TEXT.saving : FIELD_TEXT.save}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-line-section bg-card-white p-4 sm:p-5">
      <h2 className="type-section text-strong">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
