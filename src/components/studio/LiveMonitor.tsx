"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ageLabel,
  LEVEL_LABEL,
  MONITOR_TEXT as T,
  STEP_LABEL,
} from "@/content/pt-BR/control-monitor";
import { stepCounts } from "@/lib/control/monitor";
import type { LiveSnapshot } from "@/lib/control/types";
import type { StepName } from "@/lib/pipeline/types";
import { LiveIndicator } from "../editorial/LiveIndicator";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { CycleStrip } from "./CycleStrip";
import { JobTable } from "./JobTable";
import { MonitorKpis } from "./MonitorKpis";
import { RunNowButton } from "./RunNowButton";
import { SourceHealthTable } from "./SourceHealthTable";

export const LIVE_POLL_MS = 5000;

const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Cuiaba",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface LiveMonitorProps {
  initial: LiveSnapshot;
  canRun: boolean;
}

/**
 * Tempo real (O02) por polling de 5 s, sem websocket. A atualização para com a aba oculta (e
 * retoma com um retrato imediato ao voltar) e pode ser pausada à mão. O pulso do indicador usa
 * `motion-safe`: com `prefers-reduced-motion` não há animação. Falha de rede mantém o último
 * retrato com aviso; sessão expirada pede novo login.
 */
export function LiveMonitor({ initial, canRun }: LiveMonitorProps) {
  const [snap, setSnap] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [problem, setProblem] = useState<"offline" | "denied" | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (document.hidden) return;
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    try {
      const r = await fetch("/api/control/live", { cache: "no-store", signal: ctl.signal });
      if (r.status === 401 || r.status === 403) {
        setProblem("denied");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setSnap((await r.json()) as LiveSnapshot);
      setProblem(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setProblem("offline");
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(() => void refresh(), LIVE_POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void refresh();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      inflight.current?.abort();
    };
  }, [paused, refresh]);

  const pendingByStep: Record<string, number> = {};
  for (const q of snap.queues) pendingByStep[q.step] = (pendingByStep[q.step] ?? 0) + q.total;
  const steps = stepCounts(snap.steps, pendingByStep);
  const at = new Date(snap.at);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator label={paused ? T.live.paused : T.live.title} pulse={!paused} />
          <span
            data-testid="live-updated"
            data-at={snap.at}
            aria-live="off"
            className="type-meta text-meta"
          >
            {T.live.updated(clock.format(at))}
          </span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
          {paused ? T.live.resume : T.live.pause}
        </Button>
      </div>
      <p className="type-meta text-meta">
        {T.live.intro} {T.live.hiddenNote}
      </p>
      {problem && (
        <InlineAlert tone={problem === "denied" ? "error" : "warn"} role="alert">
          {problem === "denied" ? T.live.denied : T.live.offline}
        </InlineAlert>
      )}
      {canRun && <RunNowButton />}
      <MonitorKpis snap={snap} />
      <CycleStrip steps={steps} />
      <section aria-labelledby="live-jobs" className="flex flex-col gap-3">
        <h2 id="live-jobs" className="type-section text-strong">
          {T.jobs.title}
        </h2>
        <JobTable rows={snap.queues} at={snap.at} />
      </section>
      <section aria-labelledby="live-sources" className="flex flex-col gap-3">
        <h2 id="live-sources" className="type-section text-strong">
          {T.sources.title}
        </h2>
        <SourceHealthTable rows={snap.sources} at={snap.at} />
      </section>
      <section aria-labelledby="live-feed" className="flex flex-col gap-3">
        <h2 id="live-feed" className="type-section text-strong">
          {T.live.feedTitle}
        </h2>
        {snap.events.length === 0 ? (
          <p className="type-body text-meta">{T.live.feedEmpty}</p>
        ) : (
          <ul
            aria-label={T.live.feedCaption}
            data-testid="live-feed"
            className="flex flex-col gap-2"
          >
            {snap.events.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-3"
              >
                <span className="flex flex-wrap items-center gap-x-3 type-meta text-meta">
                  <span>{ageLabel(e.at, at)}</span>
                  <span className="font-semibold text-strong">{LEVEL_LABEL[e.level]}</span>
                  <span>{STEP_LABEL[e.step as StepName] ?? e.step}</span>
                  {e.itemRef && <span className="break-all">{e.itemRef}</span>}
                </span>
                <span className="type-body">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
