"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components";
import { APP_PAGE_TEXT as T } from "@/content/pt-BR/app";
import {
  captureInstallPrompt,
  installPromptAvailable,
  isStandalone,
  noPromptOnServer,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/app/install";
import { markInstalled } from "@/lib/app/invites";
import { readAppState, writeAppState } from "@/lib/app/storage";
import { useTrack } from "@/lib/events/use-track";

captureInstallPrompt();

/** P26: "Instalar" quando o navegador oferece o prompt; "Já instalado" em standalone. */
const never = () => () => {};
const onServer = () => false;

export function InstallButton() {
  const canPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    installPromptAvailable,
    noPromptOnServer,
  );
  const standalone = useSyncExternalStore(never, isStandalone, onServer);
  const [justInstalled, setJustInstalled] = useState(false);
  const send = useTrack();
  useEffect(() => {
    const onInstalled = () => {
      const s = readAppState();
      if (s && !s.install.installed) {
        writeAppState(markInstalled(s));
        void send("app_installed", { via: "prompt" });
      }
      setJustInstalled(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [send]);
  const state = standalone || justInstalled ? "installed" : canPrompt ? "prompt" : "idle";
  if (state === "installed")
    return (
      <p role="status" className="type-body font-semibold text-service">
        {T.installed}
      </p>
    );
  if (state === "prompt")
    return (
      <div>
        <Button size="lg" onClick={() => void promptInstall()}>
          {T.installNow}
        </Button>
      </div>
    );
  return null;
}
