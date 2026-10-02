"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MODELS_TEXT as T, formatBrlPrecise } from "@/content/pt-BR/ai-prompts";
import { agentName } from "@/content/pt-BR/ai-control";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  maxTokens: number | null;
  temperature: number | null;
  costPer1kIn: number;
  costPer1kOut: number;
  active: boolean;
  usedBy: string[];
}

export interface ModelTableProps {
  models: ModelItem[];
  /** Ausente = só leitura. */
  toggle?: (i: { id: string; active: boolean }) => Promise<{ ok: boolean; message: string }>;
  className?: string;
}

/** Modelos de IA (O11): preço por 1 000 tokens, limites, quem usa e ativar/desativar. */
export function ModelTable({ models, toggle, className }: ModelTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className={cx("flex flex-col gap-2", className)}>
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
        <table className="w-full min-w-[60rem] border-collapse text-left">
          <caption className="sr-only">{T.caption}</caption>
          <thead className="border-b border-line-subtle bg-section type-meta text-meta">
            <tr>
              {(
                [
                  "model",
                  "provider",
                  "maxTokens",
                  "temperature",
                  "costIn",
                  "costOut",
                  "usedBy",
                  "status",
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
            {models.map((m) => (
              <tr key={m.id} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                  {m.name}
                  <span className="block type-meta font-normal text-meta">{m.id}</span>
                </th>
                <td className="px-3 py-3 type-body">{m.provider}</td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {m.maxTokens ?? T.notApplicable}
                </td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {m.temperature ?? T.notApplicable}
                </td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {formatBrlPrecise(m.costPer1kIn)}
                </td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {formatBrlPrecise(m.costPer1kOut)}
                </td>
                <td className="px-3 py-3 type-meta text-body">
                  {m.usedBy.length === 0 ? T.notUsed : m.usedBy.map(agentName).join(", ")}
                </td>
                <td className={cx("px-3 py-3 type-body", m.active ? "text-service" : "text-meta")}>
                  {m.active ? T.active : T.inactive}
                </td>
                <td className="px-3 py-2">
                  {toggle && (
                    <Button
                      size="sm"
                      variant="outline-strong"
                      disabled={busy}
                      onClick={() =>
                        start(async () => {
                          const r = await toggle({ id: m.id, active: !m.active });
                          setStatus(r);
                          if (r.ok) router.refresh();
                        })
                      }
                    >
                      {m.active ? T.deactivate(m.name) : T.activate(m.name)}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
