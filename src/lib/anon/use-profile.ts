"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useConsent } from "@/lib/consent/client";
import { getAnonStore } from "./store";
import type { AnonProfile, AnonStore } from "./types";

type Snapshot = { profile: AnonProfile | null; degraded: boolean };

const SERVER: Snapshot = { profile: null, degraded: false };
let snapshot: Snapshot = SERVER;
const listeners = new Set<() => void>();

/** Relê o perfil e avisa todos os componentes que usam `useAnonProfile`. */
export async function refreshAnonProfile(): Promise<void> {
  const store = getAnonStore();
  try {
    const profile = await store.get();
    snapshot = { profile, degraded: store.degraded };
  } catch {
    snapshot = { profile: snapshot.profile, degraded: true };
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Perfil anônimo deste navegador para a interface (spec §5.3): `profile` é `null` até ser lido
 * do IndexedDB (no servidor e na hidratação também). `act` aplica uma mudança e relê.
 * `degraded` avisa que nada fica gravado além desta visita (Review Focus 2).
 */
export function useAnonProfile() {
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER,
  );
  const [consent] = useConsent();
  useEffect(() => {
    // O consentimento pode apagar histórico e id (ConsentProvider); relê depois dele.
    void refreshAnonProfile();
  }, [consent.personalization, consent.decided]);
  const act = useCallback(async (fn: (s: AnonStore) => Promise<unknown>) => {
    try {
      await fn(getAnonStore());
    } finally {
      await refreshAnonProfile();
    }
  }, []);
  return { profile: snap.profile, degraded: snap.degraded, ready: snap.profile !== null, act };
}
