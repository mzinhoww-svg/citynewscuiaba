"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { INSTALL_TEXT as T } from "@/content/pt-BR/app";
import { QUALIFIED_READ_EVENT } from "@/lib/anon/invite-storage";
import {
  handleFirstStandaloneOpen,
  installPromptAvailable,
  isIos,
  isIosSafari,
  isStandalone,
  noPromptOnServer,
  platformForInvite,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/app/install";
import {
  markInstalled,
  markStepsShown,
  recordRead,
  recordRefusal,
  recordVisit,
  shouldOfferInstall,
  type AppState,
} from "@/lib/app/invites";
import { useInviteSlot } from "@/lib/app/slot";
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
import { Button } from "../ui/Button";
import { IosInstallSteps } from "./IosInstallSteps";

const SHOWN_AFTER_MS = 1000;

/**
 * C07 · Faixa de instalação (spec 2026-09-28 §7.2): 2ª visita ou 3 leituras, fixa no rodapé
 * (acima da barra inferior no mobile), com "Instalar" e "Agora não". Um convite por vez
 * (`useInviteSlot`). No iPhone abre os passos (C08). Eventos só com consentimento (`useTrack`).
 */
export function InstallInvite() {
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
  const [steps, setSteps] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  const trackedShown = useRef(false);

  // O localStorage é a fonte da verdade: os handlers releem antes de gravar.
  const persist = useCallback((next: AppState) => writeAppState(next), []);

  /** Marca instalado uma vez e registra `app_installed` (só se ainda não estava). */
  const installed = useCallback(
    (via: "prompt" | "ios_steps" | "browser" | "unknown") => {
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

  const ctx = {
    standalone: typeof window !== "undefined" && isStandalone(),
    canPrompt,
    ios: typeof navigator !== "undefined" && isIos(),
    iosSafari: typeof navigator !== "undefined" && isIosSafari(),
    path: pathname,
  };
  const trigger = state ? shouldOfferInstall(state, ctx, new Date()) : false;
  const visible = useInviteSlot("install", trigger !== false, pathname);

  useEffect(() => {
    if (!visible || trackedShown.current || !trigger) return;
    const t = window.setTimeout(() => {
      trackedShown.current = true;
      void send("install_prompt_shown", { platform: platformForInvite(), trigger });
    }, SHOWN_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [visible, trigger, send]);

  // Reserva espaço no fim da página para a faixa não cobrir o conteúdo (WCAG 2.4.11).
  useEffect(() => {
    const el = regionRef.current;
    const root = document.documentElement;
    if (!visible || !el) return;
    const apply = () => root.style.setProperty("--cn-invite-h", `${el.offsetHeight}px`);
    apply();
    root.setAttribute("data-invite-open", "");
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.removeAttribute("data-invite-open");
      root.style.removeProperty("--cn-invite-h");
    };
  }, [visible]);

  if (!state || !visible) return null;

  const refuse = () => {
    const next = recordRefusal(state, "install", new Date());
    persist(next);
    void send("install_prompt_dismissed", {
      platform: platformForInvite(),
      refusals: Math.min(3, next.install.refusals) as 1 | 2 | 3,
    });
  };

  const install = async () => {
    if (ctx.ios) {
      persist(markStepsShown(state));
      setSteps(true);
      return;
    }
    const r = await promptInstall();
    if (r === "accepted") installed("prompt");
    else if (r === "dismissed") refuse();
  };

  return (
    <>
      <section
        ref={regionRef}
        role="region"
        aria-label={T.region}
        className="fixed inset-x-0 bottom-tabbar-safe z-sticky border-t border-line-section bg-card-white px-gutter py-3 shadow-md lg:bottom-0"
      >
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3">
          <p className="type-body text-strong">{T.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="outline" onClick={refuse}>
              {T.notNow}
            </Button>
            <Button size="md" onClick={() => void install()}>
              {T.install}
            </Button>
          </div>
        </div>
      </section>
      <IosInstallSteps
        open={steps}
        safari={ctx.iosSafari}
        onClose={(reason) => {
          setSteps(false);
          if (reason === "not_now") refuse();
        }}
      />
    </>
  );
}
