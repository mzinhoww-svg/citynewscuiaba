"use client";

import { useCallback } from "react";
import {
  CONTROL_TEXT,
  LEVEL_LABEL,
  QUEUE_LABEL,
  RUN_STATE_LABEL,
  stepLabel,
} from "@/content/pt-BR/control";
import type { PhaseSpan, RunState } from "@/lib/control";
import { formatDateTime, TIME_ZONE } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { PhaseChart } from "./PhaseChart";
import { usePolling } from "./usePolling";

export interface LiveData {
  at: string;
  run: { id: string; startedAt: string; state: RunState; pending: number; failed: number } | null;
  phases: PhaseSpan[];
  queue: { queue: string; step: string; ready: number; inFlight: number; retrying: number }[];
  events: {
    id: number;
    at: string;
    step: string;
    itemRef: string | null;
    level: string;
    message: string;
  }[];
}

export interface LiveMonitorProps {
  initial: LiveData;
  /** Rota JSON com o mesmo formato (`/api/control/live`). */
  endpoint: string;
  intervalMs?: number;
}

const LEVEL_ICON: Record<string, IconName> = {
  info: "check",
  warn: "refresh-cw",
  error: "circle-alert",
  security: "shield",
};
const LEVEL_INK: Record<string, string> = {
  info: "text-service",
  warn: "text-warn",
  error: "text-danger",
  security: "text-danger",
};

function isLiveData(v: unknown): v is LiveData {
  return (
    typeof v === "object" &&
    v !== null &&
    "at" in v &&
    "queue" in v &&
    Array.isArray((v as { queue: unknown }).queue) &&
    "events" in v &&
    Array.isArray((v as { events: unknown }).events)
  );
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/**
 * Tempo real (O02): ciclo atual por fase, fila por etapa e últimos eventos, atualizados a cada
 * 5 s enquanto a aba está visível (pausa em segundo plano e por botão, WCAG 2.2.2). O horário
 * da última atualização é texto comum (não é anunciado a cada 5 s); a região viva só muda com o
 * estado (ciclo, pausa, falha ao atualizar). A lista de eventos não é anunciada a cada troca.
 */
export function LiveMonitor({ initial, endpoint, intervalMs = 5_000 }: LiveMonitorProps) {
  const T = CONTROL_TEXT.live;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetch(endpoint, {
        signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body: unknown = await res.json();
      if (!isLiveData(body)) throw new Error("formato");
      return body;
    },
    [endpoint],
  );
  const { data, updatedAt, stale, hidden, paused, setPaused } = usePolling(
    load,
    initial,
    intervalMs,
  );
  const totalQueue = data.queue.reduce((s, q) => s + q.ready + q.inFlight + q.retrying, 0);
  const liveState = hidden
    ? T.paused
    : paused
      ? T.pausedByUser
      : stale
        ? T.stale
        : data.run
          ? T.runState(RUN_STATE_LABEL[data.run.state])
          : T.noRun;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="type-meta text-meta">
          {hidden ? T.paused : T.updatedAt(clock(updatedAt ?? data.at))}
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {liveState}
        </p>
        <Button
          size="sm"
          variant="outline"
          icon={paused ? "play" : "pause"}
          pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? T.resume : T.pause}
        </Button>
      </div>
      {stale && (
        <p className="inline-flex items-center gap-2 type-body text-warn">
          <Icon name="triangle-alert" size={18} />
          {T.stale}
        </p>
      )}

      <section aria-labelledby="live-phases" className="flex flex-col gap-3">
        <h2 id="live-phases" className="type-section text-strong">
          {T.phasesTitle}
        </h2>
        {data.run ? (
          <>
            <p className="type-body text-body">
              {formatDateTime(data.run.startedAt)} · {RUN_STATE_LABEL[data.run.state]}
            </p>
            {data.phases.length > 0 ? (
              <PhaseChart label={CONTROL_TEXT.run.phasesChart} phases={data.phases} />
            ) : (
              <p className="type-body text-meta">{T.phaseEmpty}</p>
            )}
          </>
        ) : (
          <p className="type-body text-meta">{CONTROL_TEXT.runs.empty}</p>
        )}
      </section>

      <section aria-labelledby="live-queue" className="flex flex-col gap-3">
        <h2 id="live-queue" className="type-section text-strong">
          {T.queueTitle}
          <span className="ml-2 type-meta tabular-nums text-meta">({totalQueue})</span>
        </h2>
        {data.queue.length === 0 ? (
          <p className="type-body text-meta">{T.queueEmpty}</p>
        ) : (
          <div
            role="region"
            aria-label={T.queueCaption}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">{T.queueCaption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    {T.col.step}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.queue}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.ready}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.inFlight}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    {T.col.retrying}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((q) => (
                  <tr
                    key={`${q.queue}:${q.step}`}
                    className="border-b border-line-subtle last:border-b-0"
                  >
                    <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                      {stepLabel(q.step)}
                    </th>
                    <td className="px-3 py-2 type-body">{QUEUE_LABEL[q.queue] ?? q.queue}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{q.ready}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{q.inFlight}</td>
                    <td className="px-3 py-2 text-right type-body tabular-nums">{q.retrying}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="live-events" className="flex flex-col gap-3">
        <h2 id="live-events" className="type-section text-strong">
          {T.eventsTitle}
        </h2>
        {data.events.length === 0 ? (
          <p className="type-body text-meta">{T.eventsEmpty}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white">
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
                <time dateTime={e.at} className="type-meta tabular-nums text-meta">
                  {clock(e.at)}
                </time>
                <span
                  className={cx(
                    "inline-flex items-center gap-1 type-meta font-semibold",
                    LEVEL_INK[e.level] ?? "text-meta",
                  )}
                >
                  <Icon name={LEVEL_ICON[e.level] ?? "info"} size={14} />
                  {LEVEL_LABEL[e.level] ?? e.level}
                </span>
                <span className="type-meta text-strong">{stepLabel(e.step)}</span>
                <span className="type-meta break-all text-body">{e.itemRef ?? ""}</span>
                <span className="w-full type-meta text-body">{e.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
