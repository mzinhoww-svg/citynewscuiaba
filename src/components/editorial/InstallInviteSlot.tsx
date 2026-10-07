"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { captureInstallPrompt, isStandalone } from "@/lib/app/install";
import { isBlockedPath } from "@/lib/app/invites";
import { readAppState } from "@/lib/app/storage";
import { usePathname } from "next/navigation";
import { safeDefault } from "@/lib/lazy";
import { useInstallInvite } from "./use-install-invite";

// O `beforeinstallprompt` pode disparar antes de qualquer pedaço carregado sob demanda: a
// captura fica no bundle principal (poucas linhas) e o convite em si vem depois.
captureInstallPrompt();

const InstallInviteBar = lazy(() =>
  safeDefault(() => import("./InstallInviteBar").then((m) => m.InstallInviteBar)),
);

/**
 * Faixa de instalação (C07) em duas partes: a contagem (visitas, leituras, `appinstalled`,
 * primeira abertura do app) roda só quando faz sentido (fora do app instalado, com
 * armazenamento e fora das rotas bloqueadas); a faixa em si só baixa quando o gatilho acende
 * (2ª visita ou 3 leituras, com como instalar). Mantém o JS das páginas leve (item 85, A-156).
 */
const never = () => () => {};
const onServer = () => false;

/** Decide no navegador (store externo: localStorage e display-mode), nunca no servidor. */
function wanted(pathname: string): boolean {
  if (isBlockedPath(pathname)) return false;
  const s = readAppState();
  if (!s) return false;
  // A primeira abertura em standalone precisa do convite montado para registrar a instalação.
  const standalone = isStandalone();
  const origemApp = location.search.includes("origem=app");
  if (standalone && !origemApp) return false;
  if (!standalone && s.install.installed) return false;
  return true;
}

function InstallInviteLoader() {
  const model = useInstallInvite();
  return model.trigger !== false ? (
    <Suspense fallback={null}>
      <InstallInviteBar {...model} />
    </Suspense>
  ) : null;
}

export function InstallInviteSlot() {
  const pathname = usePathname() ?? "/";
  const load = useSyncExternalStore(never, () => wanted(pathname), onServer);
  return load ? <InstallInviteLoader /> : null;
}
