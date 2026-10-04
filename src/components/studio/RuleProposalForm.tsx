"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  categoryText,
  MODE_TEXT,
  orderedCategories,
  ROUTE_TEXT,
  RULE_FIELD_TEXT as F,
  RULES_TEXT as T,
} from "@/content/pt-BR/rules-admin";
import type { CategoryRule, Mode, Route, RuleSet } from "@/lib/rules";
import type { RouteChange } from "@/lib/rules/simulate";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface RuleSetDraft {
  forceReview: boolean;
  sensitiveTopics: string[];
  categories: Record<string, CategoryRule>;
}

export interface SimulationView {
  changed: number;
  total: number;
  byRoute: Partial<Record<Route, RouteChange[]>>;
  diff: { path: string; from: string; to: string }[];
}

export type ProposalReply = { ok: true; message: string } | { ok: false; message: string };

export interface RuleProposalFormProps {
  /** Ponto de partida: a versão ativa. */
  current: RuleSet;
  simulate: (
    draft: RuleSetDraft,
  ) => Promise<{ ok: boolean; message: string; simulation?: SimulationView }>;
  propose: (i: { rules: RuleSetDraft; justification: string }) => Promise<ProposalReply>;
  className?: string;
}

const MODES = Object.keys(MODE_TEXT) as Mode[];
const CONTROL =
  "border-control h-10 w-full min-w-16 rounded-md bg-input px-2 type-body text-strong";

const toDraft = (r: RuleSet): RuleSetDraft => ({
  forceReview: r.forceReview,
  sensitiveTopics: [...r.sensitiveTopics],
  categories: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, { ...v }])),
});

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/**
 * Propor nova versão das regras (O05): matriz editável a partir da versão ativa, temas sensíveis,
 * revisão obrigatória e justificativa. "Simular" mostra quantos itens dos últimos 7 dias
 * mudariam de destino (Review Focus 5) e libera "Propor versão".
 */
export function RuleProposalForm({ current, simulate, propose, className }: RuleProposalFormProps) {
  const uid = useId();
  const router = useRouter();
  const [draft, setDraft] = useState<RuleSetDraft>(() => toDraft(current));
  const [topics, setTopics] = useState(current.sensitiveTopics.join("\n"));
  const [justification, setJustification] = useState("");
  const [sim, setSim] = useState<SimulationView | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const [phase, setPhase] = useState<"idle" | "simulating" | "proposing">("idle");

  const current_ = (): RuleSetDraft => ({
    ...draft,
    sensitiveTopics: topics
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
  });

  const setCat = (key: string, patch: Partial<CategoryRule>) => {
    setSim(null);
    setDraft((d) => ({
      ...d,
      categories: { ...d.categories, [key]: { ...d.categories[key]!, ...patch } },
    }));
  };

  const cols = [
    F.mode,
    F.minSources,
    F.requirePrimary,
    F.requireApprovedImage,
    F.minScore,
    F.summaryWords,
  ];

  return (
    <form
      className={cx("flex flex-col gap-5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!justification.trim()) {
          setStatus({ ok: false, message: T.form.justificationRequired });
          return;
        }
        setPhase("proposing");
        start(async () => {
          const r = await propose({ rules: current_(), justification: justification.trim() });
          setStatus(r);
          setPhase("idle");
          if (r.ok) {
            setSim(null);
            router.refresh();
          }
        });
      }}
    >
      <div
        role="region"
        aria-label={T.form.editCaption}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
      >
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <caption className="sr-only">{T.form.editCaption}</caption>
          <thead className="border-b border-line-subtle bg-section type-meta text-meta">
            <tr>
              <th scope="col" className="px-3 py-3">
                Categoria
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className="px-3 py-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedCategories(draft.categories).map(([key, c]) => {
              const name = categoryText(key);
              return (
                <tr key={key} className="border-b border-line-subtle last:border-0">
                  <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                    {name}
                  </th>
                  <td className="px-3 py-2">
                    <select
                      aria-label={T.form.field(name, F.mode)}
                      value={c.mode}
                      onChange={(e) => setCat(key, { mode: e.target.value as Mode })}
                      className={CONTROL}
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {MODE_TEXT[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      aria-label={T.form.field(name, F.minSources)}
                      value={c.minSources}
                      onChange={(e) => setCat(key, { minSources: Number(e.target.value) })}
                      className={CONTROL}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={T.form.field(name, F.requirePrimary)}
                      checked={c.requirePrimary}
                      onChange={(e) => setCat(key, { requirePrimary: e.target.checked })}
                      className="size-5 accent-action-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={T.form.field(name, F.requireApprovedImage)}
                      checked={c.requireApprovedImage}
                      onChange={(e) => setCat(key, { requireApprovedImage: e.target.checked })}
                      className="size-5 accent-action-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      aria-label={T.form.field(name, F.minScore)}
                      value={c.minScore ?? ""}
                      onChange={(e) => setCat(key, { minScore: num(e.target.value) })}
                      className={CONTROL}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      aria-label={T.form.field(name, F.summaryWords)}
                      value={c.summaryWords ?? ""}
                      onChange={(e) => setCat(key, { summaryWords: num(e.target.value) })}
                      className={CONTROL}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-topics`} className="type-label text-strong">
            {T.form.sensitiveTopics}
          </label>
          <textarea
            id={`${uid}-topics`}
            rows={6}
            value={topics}
            onChange={(e) => {
              setTopics(e.target.value);
              setSim(null);
            }}
            aria-describedby={`${uid}-topics-hint`}
            className="border-control min-h-24 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <p id={`${uid}-topics-hint`} className="type-meta text-meta">
            {T.form.sensitiveHint}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex min-h-tap items-center gap-2.5 type-body text-strong">
            <input
              type="checkbox"
              checked={draft.forceReview}
              onChange={(e) => {
                setSim(null);
                setDraft((d) => ({ ...d, forceReview: e.target.checked }));
              }}
              className="size-5 shrink-0 accent-action-primary"
            />
            {T.form.forceReview}
          </label>
          {current.forceReview && !draft.forceReview && (
            <p className="flex items-start gap-2 rounded-md bg-atencao-soft px-3 py-2 type-meta text-strong">
              <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-warn" />
              {T.form.forceReviewCritical}
            </p>
          )}
          <label htmlFor={`${uid}-just`} className="type-label text-strong">
            {T.form.justification}
          </label>
          <textarea
            id={`${uid}-just`}
            rows={4}
            required
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            aria-describedby={`${uid}-just-hint`}
            className="border-control min-h-24 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <p id={`${uid}-just-hint`} className="type-meta text-meta">
            {T.form.justificationHint}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="md"
          variant="outline-strong"
          icon="flask-conical"
          disabled={busy}
          onClick={() => {
            setPhase("simulating");
            start(async () => {
              const r = await simulate(current_());
              setPhase("idle");
              if (r.ok && r.simulation) {
                setSim(r.simulation);
                setStatus(null);
              } else {
                setSim(null);
                setStatus({ ok: false, message: r.message });
              }
            });
          }}
        >
          {phase === "simulating" ? T.form.simulating : T.form.simulate}
        </Button>
        <Button type="submit" size="md" icon="check" disabled={busy || sim === null}>
          {phase === "proposing" ? T.form.proposing : T.form.propose}
        </Button>
        {sim === null && <p className="type-meta text-meta">{T.form.simulateFirst}</p>}
      </div>

      {sim && (
        <section
          aria-label="Resultado da simulação"
          className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
        >
          <p className="type-body font-semibold text-strong">
            {T.form.result(sim.changed, sim.total)}
          </p>
          {sim.diff.length === 0 && <p className="type-body text-meta">{T.form.noChanges}</p>}
          {Object.values(sim.byRoute).some((l) => l && l.length > 0) && (
            <ul className="flex flex-col gap-1 type-body text-body">
              {Object.values(sim.byRoute)
                .flat()
                .filter((x): x is RouteChange => Boolean(x))
                .map((ch) => (
                  <li key={`${ch.from}-${ch.to}`}>
                    {T.form.resultLine(ROUTE_TEXT[ch.from], ROUTE_TEXT[ch.to], ch.count)}
                  </li>
                ))}
            </ul>
          )}
          {sim.diff.length > 0 && (
            <ul className="flex flex-col gap-1 type-meta text-meta">
              {sim.diff.map((d) => (
                <li key={d.path}>
                  {d.path}: {d.from} → {d.to}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body"
      >
        {status && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              status.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>
    </form>
  );
}
