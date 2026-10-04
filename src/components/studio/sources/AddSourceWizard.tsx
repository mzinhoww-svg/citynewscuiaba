"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { triedOutcome, WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import type { AnalyzeResult, DuplicateFound, LinkAnalysis } from "@/lib/sources/analyze";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { AnalysisProgress, type AnalysisPhase } from "./AnalysisProgress";
import { CONTROL_CLASS } from "./fields";
import { looseningFields } from "./form-options";
import { SourcePreviewList } from "./SourcePreviewList";
import { suggestionText } from "./SuggestionField";
import { AiPanel } from "./WizardAiPanel";
import {
  currentOf,
  initialFields,
  RESTRICTED,
  suggestionsOf,
  type WizardFields,
} from "./wizard-fields";
import { ReviewStep, SaveStep, TermsStep } from "./WizardReview";
import { Steps, type WizardStep } from "./WizardSteps";

/** Mesmo `ActionState` das Server Actions do painel (FS-T6), aqui só com outro nome. */
export type WizardActionResult = ActionState;
export type WizardAction = ActionFn;

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

/**
 * Assistente "Nova fonte" (spec §7.1, O04a): Endereço → Análise → Revisão → Termos → Salvar, com a
 * etapa atual em `aria-current="step"` e o progresso da análise em `aria-live="polite"`. Toda
 * sugestão da IA só entra no formulário com o clique em "Usar sugestão"; as políticas começam no
 * padrão mais restrito e o que afrouxar exige justificativa (vira mudança crítica registrada, aplicada na hora por quem pode aprovar).
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
  const [fields, setFields] = useState<WizardFields | null>(null);
  const [focusStep, setFocusStep] = useState<3 | 4 | 5>(3);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<WizardActionResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const current: WizardStep =
    phase === "analyzing"
      ? 2
      : phase === "done" && analysis
        ? focusStep
        : phase === "done" && duplicate
          ? 2
          : 1;

  const set = <K extends keyof WizardFields>(key: K, value: WizardFields[K]) =>
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

          <ReviewStep
            uid={uid}
            fields={fields}
            set={set}
            suggestions={suggestions}
            fieldErrors={fieldErrors}
            sections={sections}
            defaultFrequency={defaultFrequency}
            loosened={loosened}
            onFocus={() => setFocusStep(3)}
          />
          <TermsStep
            uid={uid}
            termsLinks={analysis.termsLinks}
            fields={fields}
            set={set}
            fieldErrors={fieldErrors}
            onFocus={() => setFocusStep(4)}
          />
          <SaveStep
            uid={uid}
            saving={saving}
            result={saveResult}
            onSave={save}
            onFocus={() => setFocusStep(5)}
          />
        </>
      )}
    </div>
  );
}
