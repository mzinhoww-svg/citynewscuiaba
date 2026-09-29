"use client";

import { useId, useState, useTransition } from "react";
import { REC_TEXT as T, WEIGHT_HINT, WEIGHT_LABEL } from "@/content/pt-BR/control-rec";
import { formatDecimal2 } from "@/lib/format/number";
import { weightsValid, WEIGHT_KEYS, type Weights } from "@/lib/ranking";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Slider } from "../ui/Slider";

export interface WeightSlidersReply {
  ok: boolean;
  message: string;
}

export interface WeightSlidersProps {
  /** Pesos em vigor (ponto de partida e base da comparação). */
  current: Weights;
  cap: number;
  discoveryEvery: number;
  /** Papel com `rec.weights`; sem ele os sliders só mostram os valores. */
  canPropose: boolean;
  propose: (input: {
    weights: Weights;
    cap: number;
    discoveryEvery: number;
    justification: string;
  }) => Promise<WeightSlidersReply>;
}

const toPoints = (w: Weights): Record<keyof Weights, number> =>
  Object.fromEntries(WEIGHT_KEYS.map((k) => [k, Math.round(w[k] * 100)])) as Record<
    keyof Weights,
    number
  >;

/**
 * Pesos do score com sliders em pontos percentuais. A soma aparece o tempo todo e "Propor"
 * fica desligado enquanto ela não for 1,00 (±0,001). Propor cria uma versão e pede aprovação
 * de outra pessoa; nada entra em vigor daqui.
 */
export function WeightSliders({
  current,
  cap,
  discoveryEvery,
  canPropose,
  propose,
}: WeightSlidersProps) {
  const uid = useId();
  const [points, setPoints] = useState(() => toPoints(current));
  const [capPct, setCapPct] = useState(Math.round(cap * 100));
  const [every, setEvery] = useState(discoveryEvery);
  const [why, setWhy] = useState("");
  const [reply, setReply] = useState<WeightSlidersReply | null>(null);
  const [pending, start] = useTransition();

  const weights = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, points[k] / 100])) as Weights;
  const check = weightsValid(weights);
  const sumText = formatDecimal2(check.sum);
  const currentPoints = toPoints(current);
  const changed =
    WEIGHT_KEYS.some((k) => points[k] !== currentPoints[k]) ||
    capPct !== Math.round(cap * 100) ||
    every !== discoveryEvery;
  const canSave = canPropose && check.ok && changed && why.trim() !== "" && !pending;

  function normalize() {
    const total = WEIGHT_KEYS.reduce((a, k) => a + points[k], 0);
    if (total <= 0) return;
    const scaled = WEIGHT_KEYS.map((k) => (points[k] / total) * 100);
    const floored = scaled.map(Math.floor);
    let rest = 100 - floored.reduce((a, n) => a + n, 0);
    const order = scaled
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (rest <= 0) break;
      floored[i]! += 1;
      rest -= 1;
    }
    setPoints(Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, floored[i]!])) as typeof points);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    start(async () => {
      const r = await propose({
        weights,
        cap: capPct / 100,
        discoveryEvery: every,
        justification: why,
      });
      setReply(r);
      if (r.ok) setWhy("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={pending}>
      <ul className="flex flex-col gap-5">
        {WEIGHT_KEYS.map((k) => (
          <li key={k} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span id={`${uid}-${k}`} className="type-label text-16 text-strong">
                {WEIGHT_LABEL[k]}
              </span>
              <output className="type-body tabular-nums text-strong">
                {formatDecimal2(points[k] / 100)}
              </output>
            </div>
            <Slider
              label={WEIGHT_LABEL[k]}
              value={points[k]}
              min={0}
              max={100}
              onChange={(v) => canPropose && setPoints((p) => ({ ...p, [k]: v }))}
              valueText={(v) => T.valueText(WEIGHT_LABEL[k], formatDecimal2(v / 100))}
            />
            <p className="type-meta text-meta">{WEIGHT_HINT[k]}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <p
          role="status"
          aria-live="polite"
          className={`type-body font-semibold tabular-nums ${check.ok ? "text-service" : "text-danger"}`}
        >
          <span className="text-strong">{T.sumLabel}: </span>
          {check.ok ? T.sumOk(sumText) : T.sumBad(sumText)}
        </p>
        {canPropose && (
          <>
            <Button variant="outline" size="sm" onClick={normalize} disabled={pending}>
              {T.normalize}
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setPoints(toPoints(current));
                setCapPct(Math.round(cap * 100));
                setEvery(discoveryEvery);
              }}
              disabled={pending}
            >
              {T.reset}
            </Button>
          </>
        )}
      </div>
      <p className="type-meta text-meta">{T.individualNote}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-cap`} className="type-label text-16 text-strong">
            {T.capLabel}: {capPct}%
          </label>
          <input
            id={`${uid}-cap`}
            type="range"
            min={10}
            max={50}
            step={1}
            value={capPct}
            disabled={!canPropose}
            onChange={(e) => setCapPct(Number(e.target.value))}
            className="cn-range min-h-tap"
            aria-describedby={`${uid}-cap-hint`}
          />
          <p id={`${uid}-cap-hint`} className="type-meta text-meta">
            {T.capHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-every`} className="type-label text-16 text-strong">
            {T.everyLabel}
          </label>
          <input
            id={`${uid}-every`}
            type="number"
            min={2}
            max={20}
            step={1}
            inputMode="numeric"
            value={every}
            disabled={!canPropose}
            onChange={(e) =>
              setEvery(Math.min(20, Math.max(2, Math.round(Number(e.target.value)) || 2)))
            }
            className="border-control h-tap w-28 rounded-lg bg-input px-4 type-body text-strong"
            aria-describedby={`${uid}-every-hint`}
          />
          <p id={`${uid}-every-hint`} className="type-meta text-meta">
            {T.everyHint}
          </p>
        </div>
      </div>

      {canPropose ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-why`} className="type-label text-16 text-strong">
            {T.justificationLabel}
          </label>
          <textarea
            id={`${uid}-why`}
            rows={3}
            maxLength={2000}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            aria-describedby={`${uid}-why-hint`}
            className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <p id={`${uid}-why-hint`} className="type-meta text-meta">
            {T.justificationHint}
          </p>
        </div>
      ) : (
        <InlineAlert tone="info" role="none">
          {T.readOnly}
        </InlineAlert>
      )}

      {reply && (
        <InlineAlert tone={reply.ok ? "success" : "error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </InlineAlert>
      )}

      {canPropose && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" disabled={!canSave}>
            {pending ? T.proposing : T.propose}
          </Button>
          {!check.ok && <span className="type-meta text-danger">{T.sumBad(sumText)}</span>}
          {check.ok && !changed && <span className="type-meta text-meta">{T.unchanged}</span>}
        </div>
      )}
    </form>
  );
}
