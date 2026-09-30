"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isIos, isIosSafari, isStandalone } from "@/lib/app/install";
import { EMPTY_APP_STATE, shouldOfferInstall, shouldOfferNotifications } from "@/lib/app/invites";
import { useInviteSlot } from "@/lib/app/slot";
import { readAppState } from "@/lib/app/storage";
import { installPromptAvailable } from "@/lib/app/install";
import { currentPushState, pushSupport } from "@/lib/push/client";
import { NOTIF_INVITE_EVENT, type NotifInviteTrigger } from "@/lib/push/invite";
import { IosInstallSteps } from "./IosInstallSteps";
import { NotificationInvite } from "./NotificationInvite";

export interface NotificationInviteSlotProps {
  trigger: NotifInviteTrigger;
  /** Matéria urgente: mostra ao montar, sem esperar evento (spec §7.4). */
  immediate?: boolean;
}

type Show = "none" | "invite" | "ios";

function decide(): Show {
  const s = readAppState() ?? null;
  if (!s) return "none";
  const support = pushSupport();
  const ios = isIos();
  const standalone = isStandalone();
  const ctx = {
    pushAvailable: support !== "unsupported" && support !== "no_keys",
    permission: (support === "granted" || support === "denied"
      ? support
      : "default") as NotificationPermission,
    subscribed: currentPushState().status === "on",
    ios,
    standalone,
    path: location.pathname,
  };
  if (shouldOfferNotifications(s, ctx, new Date())) return "invite";
  // iPhone fora do app: mostra os passos de instalação se a faixa estiver elegível.
  if (ios && !standalone && support === "ios_needs_install") {
    const install = shouldOfferInstall(
      s ?? EMPTY_APP_STATE,
      {
        standalone,
        canPrompt: installPromptAvailable(),
        ios,
        iosSafari: isIosSafari(),
        path: location.pathname,
      },
      new Date(),
    );
    if (install) return "ios";
  }
  return "none";
}

/**
 * Vaga do pré-prompt (C09) logo abaixo do gatilho: aparece quando `requestNotificationInvite`
 * dispara com este gatilho e as regras deixam (push disponível, permissão pendente, sem
 * inscrição, sem recusa recente; iPhone só no app). Um convite por vez (`useInviteSlot`).
 */
export function NotificationInviteSlot({
  trigger,
  immediate = false,
}: NotificationInviteSlotProps) {
  const pathname = usePathname() ?? "/";
  const [show, setShow] = useState<Show>("none");

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<{ trigger?: NotifInviteTrigger }>).detail;
      if (detail?.trigger !== trigger) return;
      setShow(decide());
    };
    window.addEventListener(NOTIF_INVITE_EVENT, onRequest);
    return () => window.removeEventListener(NOTIF_INVITE_EVENT, onRequest);
  }, [trigger]);

  useEffect(() => {
    if (!immediate) return;
    // Matéria urgente: decide depois de montar (o estado do push chega pelo `PushSync`).
    const t = window.setTimeout(() => setShow(decide()), 300);
    return () => window.clearTimeout(t);
  }, [immediate]);

  const visible = useInviteSlot("notif", show !== "none", pathname);
  if (!visible) return null;
  if (show === "ios")
    return <IosInstallSteps open safari={isIosSafari()} onClose={() => setShow("none")} />;
  return (
    <div className="my-3">
      <NotificationInvite trigger={trigger} onDone={() => setShow("none")} />
    </div>
  );
}
