"use client";

import { useEffect, useRef, useState } from "react";

export interface PollingState<T> {
  data: T;
  /** Instante (ISO) da última atualização bem-sucedida; `null` antes da primeira. */
  updatedAt: string | null;
  /** A última tentativa falhou (os dados mostrados são os anteriores). */
  stale: boolean;
  /** A aba está em segundo plano: nada é buscado. */
  hidden: boolean;
  /** A pessoa pausou a atualização (WCAG 2.2.2). */
  paused: boolean;
  setPaused: (p: boolean) => void;
}

/**
 * Tempo real por polling (plano P5: 5 s, sem websockets). Busca a cada `intervalMs` enquanto a
 * aba está visível; em segundo plano não busca e, ao voltar, atualiza na hora. A pessoa pode
 * pausar. Resposta atrasada de uma busca antiga nunca sobrescreve uma mais nova.
 */
export function usePolling<T>(
  load: (signal: AbortSignal) => Promise<T>,
  initial: T,
  intervalMs = 5_000,
): PollingState<T> {
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (paused) return;
    let seq = 0;
    let ctrl: AbortController | null = null;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const mine = ++seq;
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const next = await loadRef.current(ctrl.signal);
        if (mine !== seq) return;
        setData(next);
        setStale(false);
        setUpdatedAt(new Date().toISOString());
      } catch (e) {
        if (mine === seq && !(e instanceof DOMException && e.name === "AbortError")) setStale(true);
      }
    };
    const timer = setInterval(() => void tick(), intervalMs);
    const onVisibility = () => {
      const isHidden = document.visibilityState === "hidden";
      setHidden(isHidden);
      if (!isHidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      seq++;
      ctrl?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, paused]);

  return { data, updatedAt, stale, hidden, paused, setPaused };
}
