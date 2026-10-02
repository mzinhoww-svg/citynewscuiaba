"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { INVITE_TEXT } from "@/content/pt-BR/account";
import { INVITE_EVENT, type InviteRequest, type InviteTrigger } from "@/lib/anon/invite";
import { useInviteSlot } from "@/lib/app/slot";
import { noteInviteShown, readInviteHistory } from "@/lib/anon/invite-storage";
import { shouldShowInvite } from "@/lib/anon/invites";
import { hasAuthCookie } from "@/lib/auth/cookie";
import { useTrack } from "@/lib/events/use-track";
import { cx } from "../cx";
import { Button } from "../ui/Button";

/** Mesma largura de `lg:w-80` (20rem) e margem do gutter, em px de CSS, para o cálculo. */
const DESKTOP = "(min-width: 64rem)";
const WIDTH_REM = 20;
const MARGIN_REM = 1;
const GAP_REM = 0.5;
/** Altura estimada do popover para decidir se abre abaixo ou acima do botão. */
const HEIGHT_REM = 20;

/** Gatilhos em que a ação pedida precisa de conta (texto fixo "Para sincronizar…"). */
const NEEDS_ACCOUNT: readonly InviteTrigger[] = ["sync", "ai"];

type Open = { trigger: InviteTrigger; style: CSSProperties | null };

function rem(): number {
  const n = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(n) && n > 0 ? n : 16;
}

/** Popover ancorado no botão que disparou o convite (desktop). Sem âncora, canto inferior. */
function anchoredStyle(anchor: Element | null): CSSProperties | null {
  if (!(anchor instanceof HTMLElement) || anchor === document.body) return null;
  const r = anchor.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const u = rem();
  const width = WIDTH_REM * u;
  const margin = MARGIN_REM * u;
  const gap = GAP_REM * u;
  const left = Math.round(Math.min(Math.max(r.left, margin), window.innerWidth - width - margin));
  const below = r.bottom + gap + HEIGHT_REM * u <= window.innerHeight;
  return below
    ? { left, top: Math.round(r.bottom + gap), right: "auto", bottom: "auto" }
    : {
        left,
        bottom: Math.round(window.innerHeight - r.top + gap),
        top: "auto",
        right: "auto",
      };
}

/**
 * Convite contextual de login (C01, spec §5.4): aparece depois de salvar, seguir, criar alerta
 * ou coleção, sincronizar, acompanhar tema ou continuar conversa com a IA, no máximo 1 vez por
 * gatilho a cada 7 dias e nunca para quem já entrou. Folha inferior no mobile e popover
 * ancorado no desktop, ambos `<dialog>` modal: foco preso, `Esc` ou toque fora valem como
 * "Agora não" (`login_skipped`). Nunca bloqueia: fechar devolve o foco ao botão de origem.
 */
export function LoginInvite() {
  const [open, setOpen] = useState<Open | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const chose = useRef(false);
  const titleId = useId();
  const send = useTrack();
  const router = useRouter();
  const pathname = usePathname();
  // Um convite por vez (spec 2026-09-28 §7.1): login adia notificações e instalação.
  useInviteSlot("login", open !== null, pathname ?? "/");

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<InviteRequest | undefined>).detail;
      if (!detail) return;
      if (hasAuthCookie(document.cookie)) return;
      if (ref.current?.open) return;
      const now = new Date();
      if (!detail.explicit && !shouldShowInvite(detail.trigger, readInviteHistory(), now)) return;
      noteInviteShown(detail.trigger, now);
      const desktop = window.matchMedia?.(DESKTOP).matches ?? false;
      chose.current = false;
      setOpen({
        trigger: detail.trigger,
        style: desktop ? anchoredStyle(document.activeElement) : null,
      });
      void send("login_prompt_shown", { trigger: detail.trigger });
    };
    window.addEventListener(INVITE_EVENT, onRequest);
    return () => window.removeEventListener(INVITE_EVENT, onRequest);
  }, [send]);

  useEffect(() => {
    const el = ref.current;
    if (open && el && !el.open) el.showModal?.();
  }, [open]);

  const close = useCallback(() => {
    const el = ref.current;
    if (el?.open) el.close();
    else setOpen(null);
  }, []);

  const go = (path: "/entrar" | "/criar-conta") => {
    if (!open) return;
    chose.current = true;
    void send("login_started", { trigger: open.trigger, method: "email" });
    close();
    const next = pathname && pathname.startsWith("/") ? pathname : "/";
    router.push(`${path}?next=${encodeURIComponent(next)}`);
  };

  if (!open) return null;
  const needsAccount = NEEDS_ACCOUNT.includes(open.trigger);
  const anchored = open.style !== null;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      style={open.style ?? undefined}
      onClose={() => {
        if (!chose.current) void send("login_skipped", { trigger: open.trigger });
        setOpen(null);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className={cx(
        "w-full max-w-read bg-transparent p-0 backdrop:bg-overlay backdrop:backdrop-blur-scrim",
        "mx-auto mt-auto mb-0 open:motion-safe:animate-sheet-in",
        "lg:w-80 lg:backdrop:bg-transparent lg:backdrop:backdrop-blur-none lg:open:motion-safe:animate-fade-in",
        anchored ? "lg:m-0" : "lg:m-0 lg:top-auto lg:right-gutter lg:bottom-gutter lg:left-auto",
      )}
    >
      <div className="flex flex-col gap-4 rounded-t-2xl bg-card-white px-gutter pt-6 pb-8 shadow-dialog lg:rounded-lg lg:border lg:border-line-subtle lg:p-5">
        <h2 id={titleId} className="type-section text-strong">
          {INVITE_TEXT.title}
        </h2>
        {needsAccount && <p className="type-body text-body">{INVITE_TEXT.requiresAccount}</p>}
        <div className="flex flex-col gap-2">
          <Button size="md" fullWidth onClick={() => go("/criar-conta")}>
            {INVITE_TEXT.create}
          </Button>
          <Button size="md" variant="outline" fullWidth onClick={() => go("/entrar")}>
            {INVITE_TEXT.signIn}
          </Button>
          <Button size="md" variant="secondary" fullWidth onClick={close}>
            {INVITE_TEXT.notNow}
          </Button>
        </div>
        {!needsAccount && <p className="type-meta text-meta">{INVITE_TEXT.continueWithout}</p>}
      </div>
    </dialog>
  );
}
