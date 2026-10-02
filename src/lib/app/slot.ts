"use client";

/**
 * Um convite por vez (spec 2026-09-28 §7.1): consentimento (P22) > login (C01) > notificações
 * (C09) > instalação (C07). Quem está na frente adia os demais para a próxima navegação.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

export type InviteKind = "consent" | "login" | "notif" | "install";
const PRIORITY: Record<InviteKind, number> = { consent: 0, login: 1, notif: 2, install: 3 };

let holder: InviteKind | null = null;
/** Quem segura a vaga (instância do hook): dois componentes do mesmo tipo não se soltam. */
let owner: symbol | null = null;
/** Convites adiados nesta navegação (caminho em que perderam a vez). */
const deferredAt = new Map<InviteKind, string>();
const subs = new Set<() => void>();
const notify = () => {
  for (const s of subs) s();
};

export function currentInvite(): InviteKind | null {
  return holder;
}

/** `true` quando `kind` ocupa a vaga (tomando-a de quem tem prioridade menor). */
export function claimInviteSlot(kind: InviteKind, path = "", by: symbol | null = null): boolean {
  if (holder === kind && (owner === null || by === null || owner === by)) {
    owner = by ?? owner;
    return true;
  }
  if (holder === null || PRIORITY[kind] < PRIORITY[holder]) {
    if (holder !== null) deferredAt.set(holder, path);
    holder = kind;
    owner = by;
    notify();
    return true;
  }
  deferredAt.set(kind, path);
  return false;
}

export function releaseInviteSlot(kind: InviteKind, by: symbol | null = null): void {
  if (holder !== kind) return;
  if (by !== null && owner !== null && owner !== by) return;
  holder = null;
  owner = null;
  notify();
}

/** Adiado nesta navegação? (limpa ao mudar de caminho) */
export function isDeferred(kind: InviteKind, path: string): boolean {
  return deferredAt.get(kind) === path;
}

export function resetInviteSlotsForTests(): void {
  holder = null;
  owner = null;
  deferredAt.clear();
  notify();
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};
const snapshot = () => holder;
const serverSnapshot = () => null;

/**
 * Reserva a vaga enquanto `wanted`; devolve `true` quando este convite pode aparecer. Perde a
 * vaga para um convite mais importante e só tenta de novo em outra navegação (`path`).
 */
export function useInviteSlot(kind: InviteKind, wanted: boolean, path = ""): boolean {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const me = useRef<symbol | null>(null);
  me.current ??= Symbol(kind);
  useEffect(() => {
    const by = me.current!;
    if (!wanted) {
      releaseInviteSlot(kind, by);
      return;
    }
    if (isDeferred(kind, path)) return;
    claimInviteSlot(kind, path, by);
    return () => releaseInviteSlot(kind, by);
  }, [kind, wanted, path]);
  return wanted && current === kind;
}
