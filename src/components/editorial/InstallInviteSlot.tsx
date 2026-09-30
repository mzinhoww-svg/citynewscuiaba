"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { captureInstallPrompt, isStandalone } from "@/lib/app/install";
import { isBlockedPath } from "@/lib/app/invites";
import { readAppState } from "@/lib/app/storage";
import { usePathname } from "next/navigation";

// O `beforeinstallprompt` pode disparar antes de qualquer pedaço carregado sob demanda: a
// captura fica no bundle principal (poucas linhas) e o convite em si vem depois.
captureInstallPrompt();

const InstallInvite = lazy(() =>
  import("./InstallInvite").then((m) => ({ default: m.InstallInvite })),
);

/**
 * Carrega a faixa de instalação (C07) sob demanda, só quando faz sentido: fora do app
 * instalado, com armazenamento disponível e fora das rotas bloqueadas. Mantém o JS da home leve.
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

export function InstallInviteSlot() {
  const pathname = usePathname() ?? "/";
  const load = useSyncExternalStore(never, () => wanted(pathname), onServer);
  return load ? (
    <Suspense fallback={null}>
      <InstallInvite />
    </Suspense>
  ) : null;
}
