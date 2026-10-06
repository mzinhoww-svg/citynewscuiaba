"use client";

import { InstallInviteBar } from "./InstallInviteBar";
import { useInstallInvite } from "./use-install-invite";

/**
 * C07 · Faixa de instalação (spec 2026-09-28 §7.2): 2ª visita ou 3 leituras, fixa no rodapé
 * (acima da barra inferior no mobile), com "Instalar" e "Agora não". Um convite por vez
 * (`useInviteSlot`). No iPhone abre os passos (C08). Eventos só com consentimento (`useTrack`).
 *
 * Contagem e decisão em `useInstallInvite`, faixa em `InstallInviteBar`. A moldura do portal
 * monta as duas partes separadas (`InstallInviteSlot`): a faixa só baixa quando o gatilho acende.
 */
export function InstallInvite() {
  const model = useInstallInvite();
  return <InstallInviteBar {...model} />;
}
