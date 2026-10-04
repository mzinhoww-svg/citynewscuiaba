"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AGENTS_TEXT as T, formatBrl } from "@/content/pt-BR/ai-prompts";
import { agentName } from "@/content/pt-BR/ai-control";
import { budgetsValid } from "@/lib/ai/prompts";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface AgentItem {
  id: string;
  fn: string;
  enabled: boolean;
  modelId: string;
  fallbackModelId: string | null;
  productionVersion: number | null;
  dailyBudgetBrl: number;
}

export interface AgentEditInput {
  id: string;
  enabled: boolean;
  dailyBudgetBrl: number;
  modelId: string;
  fallbackModelId: string | null;
}

export interface AgentTableProps {
  agents: AgentItem[];
  models: { id: string; name: string; active: boolean }[];
  globalBudgetBrl: number;
  /** Ausente = só leitura. */
  save?: (i: AgentEditInput) => Promise<{ ok: boolean; message: string }>;
  className?: string;
}

const CONTROL =
  "border-control h-10 w-full min-w-20 rounded-md bg-input px-2 type-body text-strong";

/**
 * Agentes de IA (O10): função, modelo e fallback, prompt em produção, orçamento e liga/desliga.
 * Quem administra edita na própria linha; a soma dos orçamentos fica visível e o salvar trava
 * quando passa do teto global (A-006).
 */
export function AgentTable({ agents, models, globalBudgetBrl, save, className }: AgentTableProps) {
  const router = useRouter();
  const uid = useId();
  const [drafts, setDrafts] = useState<Record<string, AgentEditInput>>(() =>
    Object.fromEntries(
      agents.map((a) => [
        a.id,
        {
          id: a.id,
          enabled: a.enabled,
          dailyBudgetBrl: a.dailyBudgetBrl,
          modelId: a.modelId,
          fallbackModelId: a.fallbackModelId,
        },
      ]),
    ),
  );
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const budgets = budgetsValid(
    agents.map((a) => ({
      id: a.id,
      dailyBudgetBrl: drafts[a.id]?.dailyBudgetBrl ?? a.dailyBudgetBrl,
    })),
    globalBudgetBrl,
  );
  const patch = (id: string, p: Partial<AgentEditInput>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...p } }));
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: m.active ? m.name : `${m.name} (inativo)`,
  }));

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <p className={cx("type-body", budgets.ok ? "text-body" : "font-semibold text-danger")}>
        {T.budgetSum(formatBrl(budgets.sum), formatBrl(globalBudgetBrl))}
        {!budgets.ok && ` ${T.budgetOver}`}
      </p>
      <p role="status" aria-live="polite" className="min-h-6 type-body empty:hidden">
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
      <div
        role="region"
        aria-label={T.caption}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
      >
        <table className="w-full min-w-[64rem] border-collapse text-left">
          <caption className="sr-only">{T.caption}</caption>
          <thead className="border-b border-line-subtle bg-section type-meta text-meta">
            <tr>
              {(
                [
                  "agent",
                  "fn",
                  "model",
                  "fallback",
                  "prompt",
                  "budget",
                  "enabled",
                  "actions",
                ] as const
              ).map((k) => (
                <th key={k} scope="col" className="px-3 py-3">
                  {T.col[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const d = drafts[a.id]!;
              const name = agentName(a.id);
              const editable = Boolean(save);
              return (
                <tr key={a.id} className="border-b border-line-subtle last:border-0 align-top">
                  <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                    {name}
                  </th>
                  <td className="max-w-xs px-3 py-3 type-meta text-body">{a.fn}</td>
                  <td className="px-3 py-3">
                    {editable ? (
                      <select
                        aria-label={T.modelLabel(name)}
                        value={d.modelId}
                        onChange={(e) => patch(a.id, { modelId: e.target.value })}
                        className={CONTROL}
                      >
                        {modelOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="type-body">{a.modelId}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editable && a.id !== "embed" ? (
                      <select
                        aria-label={T.fallbackLabel(name)}
                        value={d.fallbackModelId ?? ""}
                        onChange={(e) => patch(a.id, { fallbackModelId: e.target.value || null })}
                        className={CONTROL}
                      >
                        <option value="">{T.none}</option>
                        {modelOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="type-body">{a.fallbackModelId ?? T.noFallback}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 type-body whitespace-nowrap">
                    {a.id === "embed" ? (
                      "—"
                    ) : (
                      <Link
                        href={`/estudio/control/prompts/${a.id}`}
                        className="text-link underline"
                      >
                        {a.productionVersion ? `v${a.productionVersion}` : T.noPrompt}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        max={globalBudgetBrl}
                        step={0.5}
                        aria-label={T.budgetLabel(name)}
                        value={d.dailyBudgetBrl}
                        onChange={(e) => patch(a.id, { dailyBudgetBrl: Number(e.target.value) })}
                        className={CONTROL}
                      />
                    ) : (
                      <span className="type-body tabular-nums">{formatBrl(a.dailyBudgetBrl)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editable ? (
                      <input
                        id={`${uid}-${a.id}-on`}
                        type="checkbox"
                        aria-label={T.enabledLabel(name)}
                        checked={d.enabled}
                        onChange={(e) => patch(a.id, { enabled: e.target.checked })}
                        className="size-5 accent-(--action-primary)"
                      />
                    ) : (
                      <span className="type-body">{a.enabled ? "Sim" : "Não"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable && (
                      <Button
                        size="sm"
                        variant="outline-strong"
                        aria-label={`${T.save} ${name}`}
                        disabled={busy || !budgets.ok}
                        onClick={() =>
                          start(async () => {
                            const r = await save!(d);
                            setStatus(r);
                            if (r.ok) router.refresh();
                          })
                        }
                      >
                        {busy ? T.saving : T.save}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
