"use client";

/**
 * Um convite por vez (spec 2026-09-28 §7.1): consentimento (P22) > login (C01) > notificações
 * (C09) > instalação (C07). Quem está na frente adia os demais para a próxima navegação.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

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
    const next = by ?? owner;
    if (next !== owner) {
      owner = next;
      notify();
    }
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
const ownerSnapshot = () => owner;

/**
 * Reserva a vaga enquanto `wanted`; devolve `true` quando este convite pode aparecer. Perde a
 * vaga para um convite mais importante e só tenta de novo em outra navegação (`path`).
 */
export function useInviteSlot(kind: InviteKind, wanted: boolean, path = ""): boolean {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const holderId = useSyncExternalStore(subscribe, ownerSnapshot, serverSnapshot);
  const [me] = useState(() => Symbol(kind));
  useEffect(() => {
    const by = me;
    if (!wanted) {
      releaseInviteSlot(kind, by);
      return;
    }
    if (isDeferred(kind, path)) return;
    claimInviteSlot(kind, path, by);
    return () => releaseInviteSlot(kind, by);
  }, [kind, wanted, path, me]);
  // Mesmo tipo em outra instância (banner de consentimento e convite da primeira visita): só
  // quem segura a vaga aparece.
  return wanted && current === kind && (holderId === null || holderId === me);
}

/** Convite que ocupa a vaga agora (ou `null`): o rodapé de publicidade some enquanto houver um. */
export function useCurrentInvite(): InviteKind | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
