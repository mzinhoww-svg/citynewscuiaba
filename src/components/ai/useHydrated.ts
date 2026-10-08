import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};
const isClient = () => true;
const isServer = () => false;

/** `false` no HTML do servidor (e para quem está sem JavaScript); `true` depois da hidratação. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, isClient, isServer);
}
