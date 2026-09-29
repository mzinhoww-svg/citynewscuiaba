"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ANALYZE_ERROR_TEXT, SOURCE_MESSAGES } from "@/content/pt-BR/sources-admin";
import { QUALITY_FLAG_TEXT, WIZARD as T } from "@/content/pt-BR/sources-admin-detail";
import type { LinkAnalysis, LinkAnalysisFresh } from "@/lib/sources/analyze";
import type { ConsumptionConfig } from "@/lib/sources/schema";
import type { SourceConfig } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { InlineAlert } from "../../ui/InlineAlert";
import { TextField } from "../../ui/TextField";
import { AnalysisProgress } from "./AnalysisProgress";
import { ActionMessage, formDataOf, useFormAction, type FormAction } from "./detail-shared";
import { SourceConfigFields, type ConfigSuggestions, type FastLaneInfo } from "./SourceConfigForm";
import { SourcePreviewList } from "./SourcePreviewList";

export interface AddSourceWizardProps {
  /** Editorias existentes. */
  sections: readonly { slug: string; label: string }[];
  fastLane: FastLaneInfo;
  /** Endereço já preenchido (reanálise de uma fonte existente). */
  initialUrl?: string;
  /** `analyzeLinkAction`. */
  analyze: FormAction<LinkAnalysis>;
  /** `createSourceAction`. */
  create: FormAction<{ id: string; slug: string; approvals: number }>;
  /** `updateSourceAction` (registra a revisão dos termos). */
  update: FormAction<{ version: number; approvals: number }>;
  /** `activateSourceAction`. */
  activate: FormAction<{ version: number }>;
  /** Relógio injetável nos testes. */
  now?: () => Date;
}

/** Piso restritivo da criação: nada que amplie direitos (o servidor impõe o mesmo). */
export const RESTRICTIVE_CONFIG: SourceConfig = {
  name: "",
  displayName: null,
  ownerId: null,
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
  termsMinIntervalMinutes: null,
  frequencyMinutes: null,
  rateLimitPerHour: 60,
  editorialScore: 3,
  priority: 2,
};

const sameUrl = (a: string | null, b: string): boolean => {
  if (!a) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin + x.pathname.replace(/\/$/, "") === y.origin + y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
};

/** Endereço do site: a origem quando o link colado já era o feed, senão o próprio link. */
export function baseUrlOf(a: LinkAnalysisFresh): string {
  if (a.discovery.feedUrl && sameUrl(a.discovery.feedUrl, a.url)) {
    try {
      return `${new URL(a.url).origin}/`;
    } catch {
      return a.url;
    }
  }
  return a.url;
}

/**
 * Configuração de coleta que a análise descobriu (`consumption`). Seletores de página só entram
 * quando a IA os sugeriu, eles extraíram itens da página e a pessoa os aceitou; sem isso a página
 * lista vira página única.
 */
export function buildConsumption(
  a: LinkAnalysisFresh,
  opts: { useSelectors: boolean; now: Date },
): ConsumptionConfig {
  const selectors = a.ai?.pageSelectors.value ?? null;
  const page = a.discovery.strategy === "page_list" || a.discovery.strategy === "page_article";
  const strategy: ConsumptionConfig["strategy"] = page
    ? a.selectorsValidated && opts.useSelectors && selectors
      ? "page_list"
      : "page_article"
    : a.discovery.strategy;
  return {
    strategy,
    feedUrl: a.discovery.feedUrl,
    ...(strategy === "page_list" && selectors ? { page: selectors } : {}),
    discovery: {
      at: opts.now.toISOString(),
      by: "auto",
      inputUrl: a.url,
      tried: a.discovery.tried.length,
    },
    robots: {
      checkedAt: opts.now.toISOString(),
      allowed: a.discovery.robots.allowed,
      crawlDelaySec: a.discovery.robots.crawlDelaySec,
    },
  };
}

function suggestionsOf(a: LinkAnalysisFresh): ConfigSuggestions {
  const s: ConfigSuggestions = {
    name: { value: a.rules.name.value, origin: "regra" },
    slug: { value: a.rules.slug.value, origin: "regra" },
    frequency: { value: a.rules.frequency.value, origin: "regra" },
    reliability: {
      value: a.rules.reliability.value,
      origin: "regra",
      needsApproval: a.rules.reliability.needsApproval,
    },
    layer: { value: a.rules.layer.value, origin: "regra" },
    rateLimitPerHour: { value: a.rules.rateLimitPerHour.value, origin: "regra" },
  };
  if (a.ai) {
    s.categories = {
      value: a.ai.categories.value,
      origin: "ia",
      confidence: a.ai.categories.confidence,
    };
    s.locality = {
      value: a.ai.locality.value,
      origin: "ia",
      confidence: a.ai.locality.confidence,
    };
  }
  return s;
}

const STRATEGY_TEXT = T.strategyValue;

/**
 * Assistente de nova fonte em cinco passos (O04a): Endereço → Análise → Revisão → Termos → Salvar.
 * A análise roda no servidor e o progresso é anunciado em `aria-live`; a prévia mostra só título,
 * data e link; sugestões da IA só entram com clique; a fonte nasce pausada e campos que ampliam
 * direitos viram pedidos de segunda aprovação. O texto digitado nunca se perde em erro.
 */
export function AddSourceWizard({
  sections,
  fastLane,
  initialUrl = "",
  analyze,
  create,
  update,
  activate,
  now = () => new Date(),
}: AddSourceWizardProps) {
  const router = useRouter();
  const uid = useId();
  const analysis = useFormAction(analyze);
  const [step, setStep] = useState<3 | 4 | 5>(3);
  const [useSelectors, setUseSelectors] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [lastUrl, setLastUrl] = useState(initialUrl);

  // Cadeia de criação: cria, registra a revisão dos termos e, se pedido, ativa.
  const save = useFormAction<{ id: string; warning?: string }>(async (fd) => {
    const intent = fd.get("intent");
    const created = await create(fd);
    if (!created.ok) return created;
    const id = created.data?.id;
    if (!id) return { ok: false, message: SOURCE_MESSAGES.unexpected };
    let version = 1;
    if (fd.get("termsReviewed") === "true") {
      const f = new FormData();
      f.set("id", id);
      f.set("version", String(version));
      f.set("termsReviewed", "true");
      const u = await update(f);
      if (u.ok && u.data) version = u.data.version;
    }
    if (intent === "activate") {
      const f = new FormData();
      f.set("id", id);
      f.set("version", String(version));
      const a = await activate(f);
      if (!a.ok)
        return {
          ok: true,
          message: T.createdNotActivated(a.message),
          data: { id, warning: a.message },
        };
    }
    router.push(`/estudio/control/fontes/${id}`);
    return { ok: true, message: created.message, data: { id } };
  });

  const result = analysis.state?.ok ? analysis.state.data : undefined;
  const fresh = result && result.duplicate === null ? result : null;
  const duplicate = result && result.duplicate !== null ? result.duplicate : null;
  const running = analysis.pending;
  const current = running ? 2 : fresh ? step : 1;

  const onAnalyze = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (running) return;
    setStep(3);
    setUseSelectors(false);
    setTermsChecked(false);
    const fd = formDataOf(e.currentTarget);
    setLastUrl(String(fd.get("url") ?? ""));
    analysis.submit(fd);
  };

  const analysisError = analysis.state && !analysis.state.ok ? analysis.state.message : null;
  const robotsBlocked = analysisError === ANALYZE_ERROR_TEXT.robots_disallowed;

  const saveState = save.state;
  const savedWarning = saveState?.ok && saveState.data?.warning ? saveState.data : null;

  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (step !== 5) {
      // Enter em um campo avança em vez de salvar antes da hora.
      setStep((s) => (s === 3 ? 4 : 5));
      return;
    }
    if (save.pending) return;
    save.submit(formDataOf(e.currentTarget, submitter));
  };

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label={T.stepsLabel} className="flex flex-wrap gap-x-2 gap-y-2">
        {T.steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li
              key={label}
              {...(active ? { "aria-current": "step" as const } : {})}
              className={cx(
                "flex items-center gap-2 rounded-pill border px-3 py-1 type-meta",
                active
                  ? "border-line-strong font-semibold text-strong"
                  : "border-line-section text-meta",
              )}
            >
              {done ? (
                <Icon name="check" size={14} className="text-service" />
              ) : (
                <span className="tabular-nums">{n}</span>
              )}
              <span>{label}</span>
              {done && <span className="sr-only"> (concluído)</span>}
            </li>
          );
        })}
      </ol>

      <form onSubmit={onAnalyze} className="flex flex-col gap-3" noValidate>
        <TextField
          id={`${uid}-url`}
          name="url"
          label={T.urlLabel}
          icon="globe"
          type="url"
          inputMode="url"
          defaultValue={initialUrl}
          hint={T.urlHint}
          autoComplete="off"
        />
        <div>
          <Button type="submit" size="md" disabled={running}>
            {running ? T.analyzing : fresh ? T.reanalyze : T.analyze}
          </Button>
        </div>
      </form>

      <AnalysisProgress phase={running ? "running" : fresh ? "done" : "idle"} analysis={fresh} />

      {analysisError && !running && (
        <InlineAlert tone="error" role="alert" title={T.errorTitle}>
          {robotsBlocked ? robotsText(lastUrl, analysisError) : analysisError}
        </InlineAlert>
      )}

      {duplicate && !running && (
        <InlineAlert
          tone="warn"
          role="alert"
          action={
            <Button size="sm" variant="outline" href={`/estudio/control/fontes/${duplicate.id}`}>
              {duplicate.archived ? T.restoreExisting : T.openExisting}
            </Button>
          }
        >
          {duplicate.archived ? T.duplicateArchived(duplicate.name) : T.duplicate(duplicate.name)}
        </InlineAlert>
      )}

      {fresh && !running && (
        <form
          onSubmit={onSave}
          noValidate
          className="flex flex-col gap-8"
          aria-label="Cadastro da fonte"
        >
          <input type="hidden" name="baseUrl" value={baseUrlOf(fresh)} />
          <input type="hidden" name="feedUrl" value={fresh.discovery.feedUrl ?? ""} />
          <input
            type="hidden"
            name="kind"
            value={
              fresh.discovery.strategy === "page_list" &&
              !(useSelectors && fresh.selectorsValidated)
                ? "page"
                : fresh.discovery.kind
            }
          />
          <input
            type="hidden"
            name="consumption"
            value={JSON.stringify(buildConsumption(fresh, { useSelectors, now: now() }))}
          />
          {fresh.discoveryId && (
            <input type="hidden" name="discoveryId" value={fresh.discoveryId} />
          )}
          {termsChecked && <input type="hidden" name="termsReviewed" value="true" />}

          <section
            hidden={step !== 3}
            aria-labelledby={`${uid}-rev`}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <h2 id={`${uid}-rev`} className="type-section text-strong">
                {T.reviewTitle}
              </h2>
              <p className="type-body text-meta">{T.reviewIntro}</p>
              <p className="type-meta text-strong">
                {T.strategy}:{" "}
                <span className="font-semibold">
                  {STRATEGY_TEXT[fresh.discovery.strategy] ?? fresh.discovery.strategy}
                </span>
              </p>
            </div>

            <section aria-labelledby={`${uid}-prev`} className="flex flex-col gap-3">
              <h3 id={`${uid}-prev`} className="type-label text-16 text-strong">
                {T.previewTitle}
              </h3>
              <SourcePreviewList
                items={fresh.preview.items}
                dropped={fresh.preview.droppedForInjection}
              />
            </section>

            <details className="rounded-lg border border-line-section bg-card-white px-4 py-3">
              <summary className="min-h-tap cursor-pointer py-2 type-label text-16 text-strong">
                {T.howWeFound}
              </summary>
              <ul className="mt-2 flex flex-col gap-1 type-meta text-meta">
                {fresh.discovery.tried.map((t, i) => (
                  <li key={`${t.url}-${i}`} className="break-all">
                    {t.url}: {T.triedOutcome[t.outcome] ?? t.outcome}
                  </li>
                ))}
                <li>{T.robotsOk(fresh.discovery.robots.crawlDelaySec)}</li>
              </ul>
            </details>

            {fresh.aiStatus !== "ok" && (
              <InlineAlert tone="info" role="none" title={T.aiUnavailableTitle}>
                {fresh.aiStatus === "unavailable"
                  ? T.aiUnavailable
                  : SOURCE_MESSAGES.analyze.aiStatus[fresh.aiStatus]}
              </InlineAlert>
            )}

            {fresh.ai && (
              <section aria-labelledby={`${uid}-qual`} className="flex flex-col gap-2">
                <h3 id={`${uid}-qual`} className="type-label text-16 text-strong">
                  {T.qualityTitle}
                </h3>
                {fresh.ai.qualityFlags.value.length === 0 ? (
                  <p className="type-meta text-meta">{T.qualityNone}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {fresh.ai.qualityFlags.value.map((f) => (
                      <li key={f} className="flex items-start gap-2 type-body text-strong">
                        <Icon name="triangle-alert" size={18} className="mt-1 shrink-0 text-warn" />
                        {QUALITY_FLAG_TEXT[f] ?? f}
                      </li>
                    ))}
                  </ul>
                )}
                <details className="type-meta text-meta">
                  <summary className="min-h-tap cursor-pointer py-2">{T.rationaleTitle}</summary>
                  <p className="mt-1">{fresh.ai.rationale.value}</p>
                </details>
              </section>
            )}

            {fresh.selectorsValidated && fresh.ai?.pageSelectors.value && (
              <section aria-labelledby={`${uid}-sel`} className="flex flex-col gap-2">
                <h3 id={`${uid}-sel`} className="type-label text-16 text-strong">
                  {T.selectorsTitle}
                </h3>
                <label className="flex min-h-tap items-start gap-3 type-body text-strong">
                  <input
                    type="checkbox"
                    checked={useSelectors}
                    onChange={(e) => setUseSelectors(e.target.checked)}
                    className="mt-1 size-5 accent-(--action-primary)"
                  />
                  <span>{T.selectorsUse(fresh.preview.items.length)}</span>
                </label>
                <p className="type-meta text-meta">{T.selectorsNote}</p>
              </section>
            )}

            <SourceConfigFields
              key={fresh.discoveryId ?? fresh.url}
              mode="create"
              initial={RESTRICTIVE_CONFIG}
              sections={sections}
              status="paused"
              fastLane={fastLane}
              suggestions={suggestionsOf(fresh)}
              fieldErrors={saveState && !saveState.ok ? saveState.fieldErrors : undefined}
            />

            <div className="flex flex-wrap gap-3">
              <Button size="md" iconRight="chevron-right" onClick={() => setStep(4)}>
                {T.next}
              </Button>
            </div>
          </section>

          <section
            hidden={step !== 4}
            aria-labelledby={`${uid}-ter`}
            className="flex flex-col gap-4"
          >
            <h2 id={`${uid}-ter`} className="type-section text-strong">
              {T.termsTitle}
            </h2>
            <p className="type-body text-meta">{T.termsIntro}</p>
            <p className="flex items-start gap-2 type-body text-strong">
              <Icon name="check" size={18} className="mt-1 shrink-0 text-service" />
              {T.robotsOk(fresh.discovery.robots.crawlDelaySec)}
            </p>
            <div className="flex flex-col gap-2">
              <h3 className="type-label text-16 text-strong">{T.termsFound}</h3>
              {fresh.termsLinks.length === 0 ? (
                <p className="type-meta text-meta">{T.termsNone}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {fresh.termsLinks.map((l) => (
                    <li key={l}>
                      <a
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-tap items-center gap-2 break-all type-body text-link underline underline-offset-4"
                      >
                        {l}
                        <Icon name="external-link" size={16} className="shrink-0" />
                        <span className="sr-only"> (abre em outra aba)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="flex min-h-tap items-start gap-3 type-body text-strong">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                className="mt-1 size-5 accent-(--action-primary)"
              />
              <span>{T.termsReviewed}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button size="md" variant="outline" onClick={() => setStep(3)}>
                {T.back}
              </Button>
              <Button size="md" iconRight="chevron-right" onClick={() => setStep(5)}>
                {T.next}
              </Button>
            </div>
          </section>

          <section
            hidden={step !== 5}
            aria-labelledby={`${uid}-sal`}
            className="flex flex-col gap-4"
          >
            <h2 id={`${uid}-sal`} className="type-section text-strong">
              {T.saveTitle}
            </h2>
            <p className="type-body text-meta">{T.saveIntro}</p>
            {!termsChecked && <p className="type-meta text-meta">{T.activateNeedsTerms}</p>}
            {saveState && !saveState.ok && saveState.fieldErrors && (
              <InlineAlert
                tone="warn"
                role="none"
                action={
                  <Button size="sm" variant="outline" onClick={() => setStep(3)}>
                    {T.backToReview}
                  </Button>
                }
              >
                {T.fieldErrorsNote}
              </InlineAlert>
            )}
            {savedWarning ? (
              <InlineAlert
                tone="warn"
                role="alert"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    href={`/estudio/control/fontes/${savedWarning.id}`}
                  >
                    {T.openCreated}
                  </Button>
                }
              >
                {saveState?.message}
              </InlineAlert>
            ) : (
              <ActionMessage state={saveState} successRole="none" />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="md" variant="outline" onClick={() => setStep(4)}>
                {T.back}
              </Button>
              <button
                type="submit"
                name="intent"
                value="pause"
                disabled={save.pending}
                className="inline-flex h-tap cursor-pointer items-center justify-center rounded-pill bg-action-primary px-5 text-16 font-semibold leading-none text-on-inverse hover:bg-action-primary-pressed disabled:cursor-not-allowed disabled:bg-nevoa-2 disabled:text-placeholder"
              >
                {save.pending ? T.saving : T.savePaused}
              </button>
              <button
                type="submit"
                name="intent"
                value="activate"
                disabled={save.pending || !termsChecked}
                className="inline-flex h-tap cursor-pointer items-center justify-center rounded-pill border border-line-control bg-card-white px-5 text-16 font-semibold leading-none text-strong hover:bg-section disabled:cursor-not-allowed disabled:bg-nevoa-2 disabled:text-placeholder"
              >
                {T.saveActivate}
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}

/** "O robots.txt de {host} não permite a coleta de {caminho}." a partir do endereço digitado. */
function robotsText(typed: string, fallback: string): string {
  try {
    const u = new URL(
      /^https?:\/\//i.test(typed.trim()) ? typed.trim() : `https://${typed.trim()}`,
    );
    return T.robotsBlocked(u.hostname, u.pathname === "" ? "/" : u.pathname);
  } catch {
    return fallback;
  }
}
