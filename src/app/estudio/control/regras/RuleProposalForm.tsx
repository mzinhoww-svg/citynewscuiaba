"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { Button, InlineAlert, RuleMatrix } from "@/components";
import {
  RULE_KIND_NOTE,
  RULE_ROUTE_LABEL,
  RULES_ADMIN_TEXT as T,
  ruleFieldLabel,
  ruleValueText,
} from "@/content/pt-BR/control-rules";
import { requiredRuleKinds, ruleProblems } from "@/lib/rules/critical";
import type { CategoryRule, RuleSet } from "@/lib/rules/types";
import type { RulesDraft, SimulationReport } from "@/lib/studio/rules";
import type { ProposeReply, SimulateReply } from "./actions";

export interface RuleProposalFormProps {
  /** Versão em vigor (base da proposta e da comparação); `null` sem versão válida. */
  current: RuleSet | null;
  /** Ponto de partida da proposta (a versão em vigor ou as regras de reserva). */
  start: RuleSet;
  simulate: (rules: RulesDraft) => Promise<SimulateReply>;
  propose: (input: {
    rules: RulesDraft;
    justification: string;
    digest: string;
  }) => Promise<ProposeReply>;
}

const topicsOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t !== "");

/**
 * Proposta de regras (O05): edita a matriz, mostra que aprovação a versão vai pedir, simula
 * com os últimos 7 dias e só então propõe, com justificativa.
 */
export function RuleProposalForm({ current, start, simulate, propose }: RuleProposalFormProps) {
  const router = useRouter();
  const uid = useId();
  const [forceReview, setForceReview] = useState(start.forceReview);
  const [topicsText, setTopicsText] = useState(start.sensitiveTopics.join("\n"));
  const [categories, setCategories] = useState<Record<string, CategoryRule>>(start.categories);
  const [justification, setJustification] = useState("");
  const [sim, setSim] = useState<{ key: string; report: SimulationReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const draft: RulesDraft = useMemo(
    () => ({ forceReview, sensitiveTopics: topicsOf(topicsText), categories }),
    [forceReview, topicsText, categories],
  );
  const key = JSON.stringify(draft);
  const next: RuleSet = { version: (current?.version ?? 0) + 1, ...draft };
  const problems = ruleProblems(next);
  const invalid = new Set(problems.map((p) => p.field));
  const kinds = requiredRuleKinds(current, next);
  const fresh = sim !== null && sim.key === key;
  const canPropose = fresh && problems.length === 0 && justification.trim() !== "" && !pending;

  const update = (category: string, patch: Partial<CategoryRule>) =>
    setCategories((c) => ({ ...c, [category]: { ...c[category]!, ...patch } }));

  const runSimulation = () => {
    setError(null);
    startTransition(async () => {
      const r = await simulate(draft);
      if (r.ok) setSim({ key, report: r.report });
      else {
        setSim(null);
        setError(r.message);
      }
    });
  };

  const submit = () => {
    if (!sim || !fresh) return;
    setError(null);
    startTransition(async () => {
      const r = await propose({ rules: draft, justification, digest: sim.report.digest });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.push(`/estudio/control/regras?ok=proposta&versao=${r.version}`);
      router.refresh();
    });
  };

  const report = fresh ? sim.report : null;
  const transitions = report ? Object.values(report.byRoute).flat() : [];

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <RuleMatrix
        categories={categories}
        caption={T.matrixCaption(null)}
        onChange={update}
        invalid={invalid}
      />
      <p className="type-meta text-meta">{T.neverAutoNote}</p>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 type-body text-strong">
          <input
            type="checkbox"
            checked={forceReview}
            onChange={(e) => setForceReview(e.target.checked)}
            aria-describedby={`${uid}-fr`}
            className="size-5 accent-(--action-primary)"
          />
          {T.forceReviewLabel}
        </label>
        <p id={`${uid}-fr`} className="type-meta text-meta">
          {T.forceReviewHint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-topics`} className="type-label text-16 text-strong">
          {T.topicsLabel}
        </label>
        <textarea
          id={`${uid}-topics`}
          rows={6}
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          aria-describedby={`${uid}-topics-hint`}
          aria-invalid={invalid.has("sensitiveTopics") || undefined}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${uid}-topics-hint`} className="type-meta text-meta">
          {T.topicsHint}
        </p>
      </div>

      {problems.length > 0 && (
        <InlineAlert tone="error" role="alert">
          <ul className="flex flex-col gap-1">
            {problems.map((p) => (
              <li key={p.field}>{T.problem(p.field, p.code)}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <section aria-labelledby={`${uid}-kinds`} className="flex flex-col gap-2">
        <h3 id={`${uid}-kinds`} className="type-label text-16 text-strong">
          {T.kindsTitle}
        </h3>
        <ul className="flex flex-col gap-2">
          {kinds.map((k) => (
            <li key={k}>
              <InlineAlert tone={k === "rules.activate" ? "info" : "warn"} role="none">
                {RULE_KIND_NOTE[k]}
              </InlineAlert>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="md"
          variant="outline"
          icon="refresh-cw"
          onClick={runSimulation}
          disabled={pending || problems.length > 0}
        >
          {pending && !report ? T.simulating : T.simulate}
        </Button>
      </div>

      <section
        aria-labelledby={`${uid}-sim`}
        aria-busy={pending || undefined}
        className="flex flex-col gap-3"
      >
        <h3 id={`${uid}-sim`} className="type-label text-16 text-strong">
          {T.simulationTitle}
        </h3>
        <div role="status" className="flex flex-col gap-3">
          {sim && !fresh && <p className="type-body text-warn">{T.simulationStale}</p>}
          {report &&
            (report.sampleSize === 0 ? (
              <p className="type-body text-body">{T.simulationEmpty(report.days)}</p>
            ) : (
              <p className="type-body font-semibold text-strong">
                {T.simulationSummary(report.changed, report.sampleSize, report.days)}
              </p>
            ))}
        </div>
        {report && report.sampleSize > 0 && transitions.length === 0 && (
          <p className="type-body text-meta">{T.simulationNone}</p>
        )}
        {transitions.length > 0 && (
          <div
            role="region"
            aria-label={T.simulationCaption}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <caption className="sr-only">{T.simulationCaption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    {T.colFrom}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.colTo}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.colCount}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transitions.map((t) => (
                  <tr
                    key={`${t.from}>${t.to}`}
                    className="border-b border-line-subtle last:border-b-0"
                  >
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {RULE_ROUTE_LABEL[t.from] ?? t.from}
                    </th>
                    <td className="px-3 py-3 type-body">{RULE_ROUTE_LABEL[t.to] ?? t.to}</td>
                    <td className="px-3 py-3 type-body tabular-nums">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report && (
          <div className="flex flex-col gap-2">
            <h4 className="type-label text-16 text-strong">{T.changesTitle}</h4>
            {report.changes.length === 0 ? (
              <p className="type-body text-meta">{T.changesNone}</p>
            ) : (
              <div
                role="region"
                aria-label={T.changesCaption}
                tabIndex={0}
                className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
              >
                <table className="w-full min-w-[32rem] border-collapse text-left">
                  <caption className="sr-only">{T.changesCaption}</caption>
                  <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                    <tr>
                      <th scope="col" className="px-3 py-3">
                        {T.colField}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colBefore}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colAfter}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.changes.map((c) => (
                      <tr key={c.field} className="border-b border-line-subtle last:border-b-0">
                        <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                          {ruleFieldLabel(c.category, c.key)}
                        </th>
                        <td className="px-3 py-3 type-body">{ruleValueText(c.key, c.from)}</td>
                        <td className="px-3 py-3 type-body">{ruleValueText(c.key, c.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-why`} className="type-label text-16 text-strong">
          {T.justificationLabel}
        </label>
        <textarea
          id={`${uid}-why`}
          rows={3}
          maxLength={2000}
          required
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          aria-describedby={`${uid}-why-hint`}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${uid}-why-hint`} className="type-meta text-meta">
          {T.justificationHint}
        </p>
      </div>

      {error && (
        <InlineAlert tone="error" role="alert">
          {error}
        </InlineAlert>
      )}

      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" size="md" icon="file-check" disabled={!canPropose}>
            {pending && fresh ? T.proposing : T.propose}
          </Button>
        </div>
        {!canPropose && <p className="type-meta text-meta">{T.proposeBlocked}</p>}
      </div>
    </form>
  );
}
