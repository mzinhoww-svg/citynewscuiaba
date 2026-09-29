"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  ANALYZE_TEXT,
  formatMinutes,
  RELIABILITY_TEXT,
  scoreText,
  SOURCE_ACTION_TEXT,
} from "@/content/pt-BR/sources-admin";
import {
  FIELD_TEXT,
  FREQUENCY_FIELD_TEXT,
  triedOutcome,
  WIZARD_TEXT,
} from "@/content/pt-BR/sources-admin-detail";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import type { AnalyzeResult, DuplicateFound, LinkAnalysis } from "@/lib/sources/analyze";
import type { ImagePolicy, Reliability, RepublishPolicy } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { AnalysisProgress, type AnalysisPhase } from "./AnalysisProgress";
import {
  ActionMessage,
  CheckboxField,
  CONTROL_CLASS,
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
} from "./form-options";
import { SourcePreviewList } from "./SourcePreviewList";
import { SuggestionField, suggestionText, type FieldSuggestion } from "./SuggestionField";

/** Mesmo formato do `ActionState` das Server Actions do painel (FS-T6). */
export type WizardActionResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };
export type WizardAction = (form: FormData) => Promise<WizardActionResult>;

export interface AddSourceWizardProps {
  /** `analyzeLinkAction` (FS-T6). */
  analyze: WizardAction;
  /** `createSourceAction` (FS-T6). */
  create: WizardAction;
  /** Editorias existentes (a IA só sugere entre estas). */
  sections: readonly { slug: string; name: string }[];
  defaultFrequency: number;
  basePath?: string;
  initialUrl?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface Fields {
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
const RESTRICTED = {
  imagePolicy: "none",
  republishPolicy: "link_only",
  reliability: "standard",
  maySoleSource: false,
} as const;

function initialFields(a: LinkAnalysis): Fields {
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
function suggestionsOf(a: LinkAnalysis): Record<string, FieldSuggestion | null> {
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
function currentOf(f: Fields): Record<string, string> {
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

const STEP_KEYS = ["address", "analysis", "review", "terms", "save"] as const;

function Steps({ current }: { current: Step }) {
  return (
    <ol
      aria-label={WIZARD_TEXT.steps.label}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 type-meta"
    >
      {STEP_KEYS.map((key, i) => {
        const n = (i + 1) as Step;
        const done = n < current;
        const isCurrent = n === current;
        return (
          <li
            key={key}
            aria-current={isCurrent ? "step" : undefined}
            className={cx(
              "flex items-center gap-2",
              isCurrent ? "font-semibold text-strong" : done ? "text-service" : "text-meta",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-6 items-center justify-center rounded-pill text-13",
                isCurrent
                  ? "bg-inverse text-on-inverse"
                  : done
                    ? "bg-cerrado-soft text-service"
                    : "border border-line-control",
              )}
            >
              {done ? <Icon name="check" size={14} /> : n}
            </span>
            {WIZARD_TEXT.steps[key]}
            {done && <span className="sr-only"> ({WIZARD_TEXT.steps.done})</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Panel({
  title,
  id,
  children,
  onFocus,
  className,
}: {
  title: string;
  id: string;
  children: ReactNode;
  onFocus?: () => void;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      onFocusCapture={onFocus}
      className={cx(
        "flex min-w-0 flex-col gap-4 rounded-lg border border-line-section bg-card-white p-4 sm:p-5",
        className,
      )}
    >
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Assistente "Nova fonte" (spec §7.1, O04a): Endereço → Análise → Revisão → Termos → Salvar, com a
 * etapa atual em `aria-current="step"` e o progresso da análise em `aria-live="polite"`. Toda
 * sugestão da IA só entra no formulário com o clique em "Usar sugestão"; as políticas começam no
 * padrão mais restrito e o que afrouxar exige justificativa (vira pedido de segunda aprovação).
 * O texto digitado nunca se perde em erro.
 */
export function AddSourceWizard({
  analyze,
  create,
  sections,
  defaultFrequency,
  basePath = "/estudio/control/fontes",
  initialUrl = "",
}: AddSourceWizardProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [url, setUrl] = useState(initialUrl);
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null);
  const [duplicate, setDuplicate] = useState<(DuplicateFound & { message: string }) | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [focusStep, setFocusStep] = useState<3 | 4 | 5>(3);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<WizardActionResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const current: Step =
    phase === "analyzing"
      ? 2
      : phase === "done" && analysis
        ? focusStep
        : phase === "done" && duplicate
          ? 2
          : 1;

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((f) => (f ? { ...f, [key]: value } : f));

  async function runAnalyze(e: FormEvent) {
    e.preventDefault();
    setPhase("analyzing");
    setAnalyzeError(null);
    setDuplicate(null);
    setAnalysis(null);
    setFields(null);
    setSaveResult(null);
    setFieldErrors({});
    const form = new FormData();
    form.set("url", url);
    let r: WizardActionResult;
    try {
      r = await analyze(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    if (!r.ok) {
      setPhase("failed");
      setAnalyzeError(r.message);
      return;
    }
    const data = r.data as AnalyzeResult;
    if (data.status === "duplicate") {
      setDuplicate({ ...data, message: r.message });
      setPhase("done");
      return;
    }
    setAnalysis(data);
    setFields(initialFields(data));
    setFocusStep(3);
    setPhase("done");
  }

  const suggestions = analysis ? suggestionsOf(analysis) : {};
  const loosened = fields
    ? looseningFields(RESTRICTED, {
        imagePolicy: fields.imagePolicy,
        republishPolicy: fields.republishPolicy,
        reliability: fields.reliability,
        maySoleSource: fields.maySoleSource,
      })
    : [];
  const needsJustification = loosened.length > 0;

  async function save(activate: boolean) {
    if (!analysis || !fields) return;
    const form = new FormData();
    form.set("baseUrl", analysis.discovery.baseUrl);
    form.set("name", fields.name);
    form.set("displayName", fields.displayName);
    form.set("slug", fields.slug);
    form.set("layer", fields.layer);
    form.set("categories", fields.categories);
    form.set("locality", fields.locality);
    form.set("reliability", fields.reliability);
    form.set("imagePolicy", fields.imagePolicy);
    form.set("republishPolicy", fields.republishPolicy);
    if (fields.maySoleSource) form.set("maySoleSource", "true");
    form.set("frequencyMinutes", fields.frequency);
    form.set("rateLimitPerHour", fields.rateLimit);
    form.set("editorialScore", fields.score);
    form.set("priority", fields.priority);
    form.set("termsUrl", fields.termsUrl);
    form.set("termsMinIntervalMinutes", fields.termsMinInterval);
    form.set("agreementUntil", fields.agreementUntil);
    form.set("agreementNote", fields.agreementNote);
    form.set("strategy", analysis.consumption.strategy);
    form.set("feedUrl", analysis.consumption.feedUrl ?? "");
    form.set(
      "pageSelectors",
      analysis.consumption.pageSelectors ? JSON.stringify(analysis.consumption.pageSelectors) : "",
    );
    form.set("discoveryId", analysis.discoveryId);
    if (fields.termsReviewed) form.set("termsReviewed", "1");
    if (activate) form.set("activate", "1");
    if (needsJustification) form.set("justification", fields.justification);
    const values = currentOf(fields);
    for (const [key, s] of Object.entries(suggestions)) {
      if (s && suggestionText(s.value) === values[key]) form.append("acceptedFields", key);
    }

    setSaving(true);
    setSaveResult(null);
    let r: WizardActionResult;
    try {
      r = await create(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setSaving(false);
    if (r.ok) {
      const id = (r.data as { id?: string } | undefined)?.id;
      if (id) {
        const code = r.message.startsWith(SOURCE_ACTION_TEXT.createdActive)
          ? "ativa"
          : activate
            ? "nao-ativada"
            : "pausada";
        router.push(`${basePath}/${id}?cadastro=${code}`);
        return;
      }
    }
    setSaveResult(r);
    setFieldErrors(r.ok ? {} : (r.fieldErrors ?? {}));
  }

  const urlId = `${uid}-url`;
  const categoryList = sections.map((s) => s.slug).join(", ");
  const freq = frequencyGroups({
    defaultMinutes: defaultFrequency,
    showFast: false,
    fastDisabledReason: null,
  });
  const criticalAside = (field: string) =>
    loosened.includes(field) ? <CriticalBadge>{FIELD_TEXT.critical}</CriticalBadge> : null;

  const progressMessage = duplicate ? (
    <div className="flex flex-wrap items-center gap-3 type-body text-strong">
      <Icon name="circle-alert" size={18} className="text-warn" />
      <span>{duplicate.message}</span>
      <Link
        href={`${basePath}/${duplicate.duplicate.id}`}
        className="font-semibold text-link underline-offset-4 hover:underline"
      >
        {duplicate.duplicate.archived
          ? WIZARD_TEXT.duplicate.restore
          : WIZARD_TEXT.duplicate.open(duplicate.duplicate.name)}
      </Link>
    </div>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Steps current={current} />

      <form
        onSubmit={runAnalyze}
        onFocusCapture={() => analysis && setFocusStep(3)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor={urlId} className="type-label text-16 text-strong">
            {WIZARD_TEXT.address.label}
          </label>
          <input
            id={urlId}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={analyzeError ? true : undefined}
            aria-describedby={[`${urlId}-dica`, analyzeError ? `${urlId}-erro` : null]
              .filter(Boolean)
              .join(" ")}
            className={cx(CONTROL_CLASS, analyzeError && "field-error")}
          />
          <p id={`${urlId}-dica`} className="type-meta text-meta">
            {WIZARD_TEXT.address.hint}
          </p>
        </div>
        <Button type="submit" size="lg" disabled={phase === "analyzing" || url.trim() === ""}>
          {phase === "analyzing"
            ? WIZARD_TEXT.address.analyzing
            : analysis || duplicate
              ? WIZARD_TEXT.address.again
              : WIZARD_TEXT.address.analyze}
        </Button>
      </form>
      {analyzeError && (
        <p
          id={`${urlId}-erro`}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger bg-erro-soft px-4 py-3 type-body text-strong"
        >
          <Icon name="circle-alert" size={18} className="mt-0.5 shrink-0 text-danger" />
          {analyzeError}
        </p>
      )}

      <AnalysisProgress
        phase={duplicate ? "idle" : phase}
        analysis={analysis}
        message={progressMessage}
      />

      {analysis && fields && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
              <section
                aria-labelledby={`${uid}-como`}
                className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
              >
                <h2 id={`${uid}-como`} className="type-section text-strong">
                  {WIZARD_TEXT.howFound.title}
                </h2>
                {analysis.discovery.tried.length === 0 ? (
                  <p className="type-body text-meta">{WIZARD_TEXT.howFound.empty}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {analysis.discovery.tried.map((t, i) => (
                      <li
                        key={`${t.url}-${i}`}
                        className="flex flex-col gap-0.5 type-meta sm:flex-row sm:gap-2"
                      >
                        <span className="min-w-0 break-all text-strong">{t.url}</span>
                        <span className={t.outcome === "ok" ? "text-service" : "text-meta"}>
                          {triedOutcome(t.outcome)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <SourcePreviewList
                items={analysis.preview.items}
                className="rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
              />
            </div>
            <AiPanel analysis={analysis} titleId={`${uid}-ia`} />
          </div>

          <Panel
            title={WIZARD_TEXT.review.title}
            id={`${uid}-revisao`}
            onFocus={() => setFocusStep(3)}
          >
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
              <FieldShell
                id={`${uid}-imagePolicy`}
                label={FIELD_TEXT.imagePolicy}
                hint={FIELD_TEXT.criticalStatic}
                aside={criticalAside("imagePolicy")}
              >
                <NativeSelect
                  id={`${uid}-imagePolicy`}
                  name="imagePolicy"
                  value={fields.imagePolicy}
                  onChange={(v) => set("imagePolicy", v as ImagePolicy)}
                  options={IMAGE_POLICY_OPTIONS}
                  hint={FIELD_TEXT.criticalStatic}
                />
              </FieldShell>
              <FieldShell
                id={`${uid}-republish`}
                label={FIELD_TEXT.republishPolicy}
                hint={FIELD_TEXT.criticalStatic}
                aside={criticalAside("republishPolicy")}
              >
                <NativeSelect
                  id={`${uid}-republish`}
                  name="republishPolicy"
                  value={fields.republishPolicy}
                  onChange={(v) => set("republishPolicy", v as RepublishPolicy)}
                  options={REPUBLISH_OPTIONS}
                  hint={FIELD_TEXT.criticalStatic}
                />
              </FieldShell>
              <CheckboxField
                id={`${uid}-sole`}
                label={FIELD_TEXT.maySoleSource}
                checked={fields.maySoleSource}
                onChange={(v) => set("maySoleSource", v)}
                hint={FIELD_TEXT.criticalStatic}
                aside={criticalAside("maySoleSource")}
              />
              <TextInput
                id={`${uid}-agreementUntil`}
                label={FIELD_TEXT.agreementUntil}
                type="date"
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
            {needsJustification && (
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
              <FieldShell id={`${uid}-score`} label={FIELD_TEXT.score} hint={FIELD_TEXT.scoreHint}>
                <NativeSelect
                  id={`${uid}-score`}
                  name="editorialScore"
                  value={fields.score}
                  onChange={(v) => set("score", v)}
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: scoreText(n) }))}
                  hint={FIELD_TEXT.scoreHint}
                />
              </FieldShell>
              <FieldShell id={`${uid}-priority`} label={FIELD_TEXT.priority}>
                <NativeSelect
                  id={`${uid}-priority`}
                  name="priority"
                  value={fields.priority}
                  onChange={(v) => set("priority", v)}
                  options={PRIORITY_OPTIONS}
                />
              </FieldShell>
            </FieldGroup>
          </Panel>

          <Panel
            title={WIZARD_TEXT.terms.title}
            id={`${uid}-termos`}
            onFocus={() => setFocusStep(4)}
          >
            <p className="flex items-start gap-2 type-body text-strong">
              <Icon name="check" size={18} className="mt-0.5 shrink-0 text-service" />
              {WIZARD_TEXT.terms.robotsOk}
            </p>
            {analysis.termsLinks.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="type-body text-strong">{WIZARD_TEXT.terms.found}</p>
                <ul className="flex flex-col gap-1">
                  {analysis.termsLinks.map((href) => (
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

          <Panel
            title={WIZARD_TEXT.save.title}
            id={`${uid}-salvar`}
            onFocus={() => setFocusStep(5)}
          >
            <p className="type-body text-meta">{WIZARD_TEXT.save.hint}</p>
            <ActionMessage result={saveResult} />
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button size="md" onClick={() => save(false)} disabled={saving}>
                {saving ? WIZARD_TEXT.save.saving : WIZARD_TEXT.save.paused}
              </Button>
              <Button
                size="md"
                variant="outline"
                onClick={() => save(true)}
                disabled={saving || !fields.termsReviewed}
              >
                {WIZARD_TEXT.save.activate}
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
      <legend className="mb-3 type-label text-16 font-semibold text-strong">{title}</legend>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function AiPanel({ analysis, titleId }: { analysis: LinkAnalysis; titleId: string }) {
  const ai = analysis.aiStatus === "ok" ? analysis.ai : null;
  const notice =
    analysis.aiStatus === "unavailable"
      ? ANALYZE_TEXT.aiUnavailable
      : analysis.aiStatus === "disabled"
        ? WIZARD_TEXT.ai.disabled
        : analysis.aiStatus === "insufficient_data"
          ? WIZARD_TEXT.ai.insufficient
          : null;
  return (
    <aside
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-ai bg-ia-soft p-4 sm:p-5"
    >
      <h2 id={titleId} className="type-section text-strong">
        {WIZARD_TEXT.ai.title}
      </h2>
      {notice && <p className="type-body text-strong">{notice}</p>}
      {ai && (
        <>
          <p className="type-meta text-strong">
            {FIELD_TEXT.suggestion.ia}: {FIELD_TEXT.categories} e {FIELD_TEXT.locality} ficam nos
            campos abaixo, com o botão “Usar sugestão”.
          </p>
          <div className="flex flex-col gap-1">
            <p className="type-label text-16 text-strong">{WIZARD_TEXT.ai.qualityTitle}</p>
            {ai.qualityFlags.value.length === 0 ? (
              <p className="type-meta text-meta">{WIZARD_TEXT.ai.noQuality}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {ai.qualityFlags.value.map((flag) => (
                  <li key={flag} className="flex items-center gap-1.5 type-body text-strong">
                    <Icon name="circle-alert" size={16} className="text-warn" />
                    {WIZARD_TEXT.quality[flag] ?? flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ai.rationale.value && (
            <div className="flex flex-col gap-1">
              <p className="type-label text-16 text-strong">{WIZARD_TEXT.ai.rationale}</p>
              <p className="type-meta text-strong">{ai.rationale.value}</p>
            </div>
          )}
          {analysis.selectorsValidated && (
            <p className="type-meta text-strong">{WIZARD_TEXT.ai.selectorsOk}</p>
          )}
        </>
      )}
    </aside>
  );
}
