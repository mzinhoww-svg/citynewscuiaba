"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  formatSum,
  formatWeight,
  REC_TEXT as T,
  WEIGHT_TEXT,
} from "@/content/pt-BR/recommendation-admin";
import { weightsValid } from "@/lib/ranking/experiments";
import { WEIGHT_KEYS } from "@/lib/ranking/score";
import type { Weights } from "@/lib/ranking/types";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export type RecReply = { ok: boolean; message: string };

export interface WeightSlidersProps {
  /** Pesos ativos (ponto de partida). */
  current: Weights;
  version: string;
  propose: (i: { weights: Weights; justification: string }) => Promise<RecReply>;
  className?: string;
}

const STEP = 0.01;

/**
 * Pesos do score (O17): um controle deslizante por componente com o valor numérico ao lado, a
 * soma sempre visível e "Propor" desabilitado enquanto a soma não fecha em 1,00 ± 0,001
 * (Review Focus 2). A proposta abre um pedido `rec.weights` para outra pessoa.
 */
export function WeightSliders({ current, version, propose, className }: WeightSlidersProps) {
  const uid = useId();
  const router = useRouter();
  const [w, setW] = useState<Weights>({ ...current });
  const [justification, setJustification] = useState("");
  const [status, setStatus] = useState<RecReply | null>(null);
  const [busy, start] = useTransition();
  const valid = weightsValid(w);
  const changed = WEIGHT_KEYS.some((k) => Math.abs(w[k] - current[k]) >= 0.0005);
  const set = (k: keyof Weights, v: number) =>
    setW((prev) => ({ ...prev, [k]: Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000 }));

  return (
    <form
      className={cx("flex flex-col gap-5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid.ok) return setStatus({ ok: false, message: T.sumBad });
        if (!justification.trim())
          return setStatus({ ok: false, message: T.justificationRequired });
        start(async () => {
          const r = await propose({ weights: w, justification: justification.trim() });
          setStatus(r);
          if (r.ok) {
            setJustification("");
            router.refresh();
          }
        });
      }}
    >
      <p className="type-body text-body">{T.activeWeights(version)}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {WEIGHT_KEYS.map((k) => {
          const id = `${uid}-${k}`;
          return (
            <div
              key={k}
              className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-3"
            >
              <label htmlFor={id} className="type-label text-16 text-strong">
                {WEIGHT_TEXT[k].label}
              </label>
              <p id={`${id}-hint`} className="type-meta text-meta">
                {WEIGHT_TEXT[k].hint}
              </p>
              <div className="flex items-center gap-3">
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={1}
                  step={STEP}
                  value={w[k]}
                  aria-describedby={`${id}-hint`}
                  aria-valuetext={formatWeight(w[k])}
                  onChange={(e) => set(k, Number(e.target.value))}
                  style={{ "--cn-range-fill": `${w[k] * 100}%` } as React.CSSProperties}
                  className="cn-range min-h-tap flex-1 cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={STEP}
                  value={w[k]}
                  aria-label={T.weightLabel(WEIGHT_TEXT[k].label)}
                  onChange={(e) => set(k, Number(e.target.value))}
                  className="border-control h-10 w-24 rounded-md bg-input px-2 type-body tabular-nums text-strong"
                />
              </div>
            </div>
          );
        })}
      </div>
      <p
        aria-live="polite"
        className={cx(
          "flex items-center gap-2 type-body font-semibold",
          valid.ok ? "text-service" : "text-danger",
        )}
      >
        <Icon name={valid.ok ? "check" : "circle-alert"} size={18} />
        {T.sum(formatSum(valid.sum))} · {valid.ok ? T.sumOk : T.sumBad}
      </p>
      <label htmlFor={`${uid}-just`} className="type-label text-16 text-strong">
        {T.justification}
      </label>
      <textarea
        id={`${uid}-just`}
        rows={3}
        required
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        className="border-control min-h-20 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" icon="check" disabled={busy || !valid.ok || !changed}>
          {busy ? T.proposing : T.propose}
        </Button>
        <Button type="button" size="md" variant="outline" onClick={() => setW({ ...current })}>
          {T.reset}
        </Button>
        {!changed && <span className="type-meta text-meta">{T.noChanges}</span>}
      </div>
      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
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
