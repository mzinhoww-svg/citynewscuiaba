"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { QUALIFIED_READ_EVENT } from "@/lib/anon/invite-storage";
import {
  handleFirstStandaloneOpen,
  installPromptAvailable,
  isIos,
  isIosSafari,
  isStandalone,
  noPromptOnServer,
  subscribeInstallPrompt,
  type InstalledVia,
} from "@/lib/app/install";
import {
  markInstalled,
  recordRead,
  recordVisit,
  shouldOfferInstall,
  type AppState,
  type InstallContext,
} from "@/lib/app/invites";
import {
  appStateOnServer,
  isNewTabSession,
  NO_STORAGE,
  parseAppState,
  readAppRaw,
  readAppState,
  subscribeAppState,
  writeAppState,
} from "@/lib/app/storage";
import { useTrack } from "@/lib/events/use-track";

export interface InstallInviteModel {
  state: AppState | null;
  ctx: InstallContext;
  /** Gatilho da faixa (`false` = não mostrar). */
  trigger: ReturnType<typeof shouldOfferInstall>;
  persist: (next: AppState) => void;
  /** Marca instalado uma vez e registra `app_installed` (só se ainda não estava). */
  installed: (via: InstalledVia) => void;
  send: ReturnType<typeof useTrack>;
}

/**
 * Contagem e decisão da faixa de instalação (C07), sem a faixa: visita, leituras qualificadas,
 * `appinstalled` e a primeira abertura do app. Fica no carregamento da moldura; a faixa em si
 * (`InstallInviteBar`) só baixa quando o gatilho acende (item 85, A-154).
 */
export function useInstallInvite(): InstallInviteModel {
  const pathname = usePathname() ?? "/";
  const send = useTrack();
  // Estado em localStorage como store externo: o efeito de montagem só grava.
  const raw = useSyncExternalStore(subscribeAppState, readAppRaw, appStateOnServer);
  const state: AppState | null = useMemo(
    () => (raw === NO_STORAGE ? null : parseAppState(raw)),
    [raw],
  );
  // `beforeinstallprompt` é um store externo: sem setState em efeito.
  const canPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    installPromptAvailable,
    noPromptOnServer,
  );

  // O localStorage é a fonte da verdade: os handlers releem antes de gravar.
  const persist = useCallback((next: AppState) => writeAppState(next), []);

  const installed = useCallback(
    (via: InstalledVia) => {
      const cur = readAppState();
      if (!cur || cur.install.installed) return;
      persist(markInstalled(cur));
      void send("app_installed", { via });
    },
    [persist, send],
  );

  useEffect(() => {
    const s = readAppState();
    if (!s) return;
    const via = handleFirstStandaloneOpen((v) => void send("app_installed", { via: v }));
    const after = via ? (readAppState() ?? s) : s;
    persist(recordVisit(after, new Date(), isNewTabSession()));
    const onRead = () => {
      const cur = readAppState();
      if (cur) persist(recordRead(cur));
    };
    const onInstalled = () => installed("prompt");
    window.addEventListener(QUALIFIED_READ_EVENT, onRead);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(QUALIFIED_READ_EVENT, onRead);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [persist, send, installed]);

  const ctx: InstallContext = {
    standalone: typeof window !== "undefined" && isStandalone(),
    canPrompt,
    ios: typeof navigator !== "undefined" && isIos(),
    iosSafari: typeof navigator !== "undefined" && isIosSafari(),
    path: pathname,
  };
  const trigger = state ? shouldOfferInstall(state, ctx, new Date()) : false;
  return { state, ctx, trigger, persist, installed, send };
}
