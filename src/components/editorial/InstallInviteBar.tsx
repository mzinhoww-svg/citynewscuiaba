"use client";

import { useEffect, useRef, useState } from "react";
import { INSTALL_TEXT as T } from "@/content/pt-BR/app";
import { platformForInvite, promptInstall } from "@/lib/app/install";
import { markStepsShown, recordRefusal } from "@/lib/app/invites";
import { useInviteSlot } from "@/lib/app/slot";
import { Button } from "../ui/Button";
import { IosInstallSteps } from "./IosInstallSteps";
import type { InstallInviteModel } from "./use-install-invite";

const SHOWN_AFTER_MS = 1000;

/**
 * C07 · A faixa de instalação em si (spec 2026-09-28 §7.2): fixa no rodapé (acima da barra
 * inferior no mobile), com "Instalar" e "Agora não". Um convite por vez (`useInviteSlot`). No
 * iPhone abre os passos (C08). Recebe o modelo de `useInstallInvite`; a moldura só baixa este
 * pedaço quando o gatilho acende (item 85, A-154).
 */
export function InstallInviteBar({
  state,
  ctx,
  trigger,
  persist,
  installed,
  send,
}: InstallInviteModel) {
  const [steps, setSteps] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  const trackedShown = useRef(false);
  const visible = useInviteSlot("install", trigger !== false, ctx.path);

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
