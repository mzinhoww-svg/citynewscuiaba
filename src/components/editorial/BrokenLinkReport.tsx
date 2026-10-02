"use client";

import { useActionState } from "react";
import { SOURCE_PAGE_TEXT } from "@/content/pt-BR/sources";
import { REPORT_HONEYPOT, REPORT_IDLE, type ReportState } from "@/lib/reports/form-state";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface BrokenLinkReportProps {
  /** Id do item agregado (`aggregated:<id>`). */
  itemId: string;
  /** Título do item (nome acessível do botão). */
  title: string;
  /** Server Action de "Informar problema" (limite 5/h por IP, honeypot). */
  action: (state: ReportState, form: FormData) => Promise<ReportState>;
  className?: string;
}

/**
 * "Link quebrado?" de um item agregado (P15): um toque avisa a redação, sem login e sem
 * formulário. O resultado aparece no lugar do botão (`role="status"`).
 *
 * ```tsx
 * <BrokenLinkReport itemId={item.id} title={item.title} action={reportProblemAction} />
 * ```
 */
export function BrokenLinkReport({ itemId, title, action, className }: BrokenLinkReportProps) {
  const [state, formAction, pending] = useActionState(action, REPORT_IDLE);
  const done = state.status === "success";
  return (
    <form action={formAction} className={cx("flex flex-wrap items-center gap-2", className)}>
      <input type="hidden" name="contentRef" value={`aggregated:${itemId}`} />
      <input type="hidden" name="kind" value="broken_link" />
      <div aria-hidden="true" className="hidden">
        <input type="text" name={REPORT_HONEYPOT} tabIndex={-1} autoComplete="off" />
      </div>
      {!done && (
        <button
          type="submit"
          disabled={pending}
          aria-label={SOURCE_PAGE_TEXT.brokenLinkLabel(title)}
          className="inline-flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill px-2 text-14 font-medium text-meta hover:text-strong hover:underline disabled:cursor-wait"
        >
          <Icon name="flag" size={14} />
          {pending ? SOURCE_PAGE_TEXT.brokenLinkSending : SOURCE_PAGE_TEXT.brokenLink}
        </button>
      )}
      <p role="status" className={cx("type-meta", done ? "text-service" : "text-danger")}>
        {state.status === "idle" ? "" : done ? SOURCE_PAGE_TEXT.brokenLinkDone : state.message}
      </p>
    </form>
  );
}
