"use client";

import type { ReactNode } from "react";
import { WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_KEYS = ["address", "analysis", "review", "terms", "save"] as const;

/** Trilha de etapas do assistente: a atual em `aria-current="step"`, as feitas com "(concluída)". */
export function Steps({ current }: { current: WizardStep }) {
  return (
    <ol
      aria-label={WIZARD_TEXT.steps.label}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 type-meta"
    >
      {STEP_KEYS.map((key, i) => {
        const n = (i + 1) as WizardStep;
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

/** Bloco de uma etapa (Revisão, Termos, Salvar): `section` nomeada pelo título. */
export function Panel({
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

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
      <legend className="mb-3 type-label text-16 font-semibold text-strong">{title}</legend>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}
