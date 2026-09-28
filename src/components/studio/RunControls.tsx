"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CONTROL_TEXT, stepLabel } from "@/content/pt-BR/control";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";

export interface ControlReply {
  ok: boolean;
  message: string;
}

function StatusLine({ status }: { status: ControlReply | null }) {
  return (
    <p role="status" aria-live="polite" className="min-h-6 type-body">
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
  );
}

export interface RunNowFormProps {
  sources: { id: string; name: string }[];
  run: (i: { sourceId?: string }) => Promise<ControlReply>;
  className?: string;
}

/**
 * "Executar agora" (O01): ciclo fora da janela para todas as fontes ativas ou uma só.
 * Resultado (ou o motivo da recusa) em `role="status"`.
 */
export function RunNowForm({ sources, run, className }: RunNowFormProps) {
  const T = CONTROL_TEXT.overview;
  const uid = useId();
  const router = useRouter();
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ControlReply | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={cx("flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await run(source ? { sourceId: source } : {});
          setStatus(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Select
          id={`${uid}-source`}
          name="fonte"
          label={T.runNowSource}
          options={[
            { value: "", label: T.runNowAll },
            ...sources.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={source}
          onChange={setSource}
          className="min-w-64"
        />
        <Button type="submit" size="md" icon="play" disabled={pending}>
          {T.runNow}
        </Button>
      </div>
      <p className="type-meta text-meta">{T.runNowHint}</p>
      <StatusLine status={status} />
    </form>
  );
}

export interface ReprocessFormProps {
  steps: string[];
  defaultStep: string;
  reprocess: (i: { fromStep: string; keepHumanDecisions: boolean }) => Promise<ControlReply>;
  className?: string;
}

/** Reprocessar um ciclo a partir de uma etapa (O07), mantendo decisões humanas por padrão. */
export function ReprocessForm({ steps, defaultStep, reprocess, className }: ReprocessFormProps) {
  const T = CONTROL_TEXT.reprocess;
  const F = CONTROL_TEXT.failures;
  const uid = useId();
  const router = useRouter();
  const [step, setStep] = useState(defaultStep);
  const [keepHuman, setKeepHuman] = useState(true);
  const [status, setStatus] = useState<ControlReply | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={cx("flex flex-col gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reprocess({ fromStep: step, keepHumanDecisions: keepHuman });
          setStatus(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Select
        id={`${uid}-step`}
        name="etapa"
        label={T.fromStep}
        options={steps.map((s) => ({ value: s, label: stepLabel(s) }))}
        value={step}
        onChange={setStep}
      />
      <label className="inline-flex min-h-tap items-center gap-2 type-body text-strong">
        <input
          type="checkbox"
          checked={keepHuman}
          onChange={(e) => setKeepHuman(e.target.checked)}
          aria-describedby={`${uid}-keep`}
          className="size-5 accent-(--action-primary)"
        />
        {F.keepHuman}
      </label>
      <p id={`${uid}-keep`} className="type-meta text-meta">
        {F.keepHumanHint}
      </p>
      <div>
        <Button type="submit" size="md" icon="refresh-cw" disabled={pending}>
          {T.submit}
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  );
}
