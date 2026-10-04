"use client";

import { useActionState, useId, useState } from "react";
import { REPORT } from "@/content/pt-BR/portal-article";
import {
  REPORT_HONEYPOT,
  REPORT_IDLE,
  REPORT_KINDS,
  type ReportState,
} from "@/lib/reports/form-state";
import { cx } from "../cx";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { RadioGroup } from "../ui/RadioGroup";
import { TextArea } from "../ui/TextArea";
import { TextField } from "../ui/TextField";

export interface ReportProblemFormProps {
  /** `article:<id>` do conteúdo. */
  contentRef: string;
  /** Server Action com limite de 5/h por IP e honeypot. */
  action: (state: ReportState, form: FormData) => Promise<ReportState>;
  /** `link`: texto discreto (barra da matéria e painel "De onde veio"). */
  variant?: "button" | "link";
  className?: string;
}

/**
 * Informar problema (P03, E14): botão que abre a folha com o formulário. Sem login; tipo do
 * problema obrigatório, mensagem e e-mail opcionais. Erros com ícone, texto e exemplo.
 *
 * ```tsx
 * <ReportProblemForm contentRef={`article:${a.id}`} action={reportProblemAction} />
 * ```
 */
export function ReportProblemForm({
  contentRef,
  action,
  variant = "button",
  className,
}: ReportProblemFormProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, REPORT_IDLE);
  const id = useId();
  const kindError = state.status === "invalid" && state.field === "kind" ? state.message : "";
  const contactError =
    state.status === "invalid" && state.field === "contact" ? state.message : undefined;
  const generalError =
    state.status === "rate_limited" || state.status === "error" ? state.message : "";

  return (
    <>
      {variant === "link" ? (
        <Button
          variant="text"
          size="sm"
          icon="flag"
          onClick={() => setOpen(true)}
          className={cx("min-h-button-sm! hit-area text-14!", className)}
        >
          {REPORT.open}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="md"
          icon="flag"
          collapseLabel
          onClick={() => setOpen(true)}
          className={className}
        >
          {REPORT.open}
        </Button>
      )}
      <BottomSheet open={open} title={REPORT.title} onClose={() => setOpen(false)}>
        {state.status === "success" ? (
          <div className="flex flex-col gap-6">
            <p role="status" className="flex items-start gap-2 type-body text-service">
              <Icon name="check" size={20} className="mt-0.5 shrink-0" />
              {state.message}
            </p>
            <Button fullWidth onClick={() => setOpen(false)}>
              {REPORT.close}
            </Button>
          </div>
        ) : (
          <form action={formAction} noValidate className="flex flex-col gap-5">
            <p className="type-body text-meta">{REPORT.intro}</p>
            <input type="hidden" name="contentRef" value={contentRef} />
            <RadioGroup
              name="kind"
              legend={REPORT.kindLegend}
              options={REPORT_KINDS.map((k) => ({ value: k, label: REPORT.kinds[k] }))}
              error={kindError}
            />
            <TextArea
              id={`${id}-msg`}
              name="message"
              label={REPORT.message}
              hint={REPORT.messageHint}
              rows={3}
              maxLength={1000}
            />
            <TextField
              id={`${id}-contact`}
              name="contact"
              type="email"
              icon="mail"
              label={REPORT.contact}
              placeholder={REPORT.contactPlaceholder}
              autoComplete="email"
              error={contactError}
            />
            <div hidden>
              <label htmlFor={`${id}-${REPORT_HONEYPOT}`}>{REPORT.honeypotLabel}</label>
              <input
                id={`${id}-${REPORT_HONEYPOT}`}
                name={REPORT_HONEYPOT}
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <div aria-live="polite">
              {generalError && (
                <p role="alert" className="flex items-start gap-1.5 type-body text-danger">
                  <Icon name="circle-alert" size={20} className="mt-0.5 shrink-0" />
                  {generalError}
                </p>
              )}
            </div>
            <Button type="submit" fullWidth loading={pending} loadingLabel={REPORT.sending}>
              {REPORT.submit}
            </Button>
          </form>
        )}
      </BottomSheet>
    </>
  );
}
