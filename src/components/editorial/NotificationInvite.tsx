"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { NOTIF_TEXT as T } from "@/content/pt-BR/notifications";
import { recordRefusal } from "@/lib/app/invites";
import { readAppState, writeAppState } from "@/lib/app/storage";
import { useTrack } from "@/lib/events/use-track";
import { enablePush, type EnableError } from "@/lib/push/client";
import type { NotifInviteTrigger } from "@/lib/push/invite";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

const SHOWN_AFTER_MS = 1000;

export interface NotificationInviteProps {
  trigger: NotifInviteTrigger;
  /** Chamado ao fechar por qualquer caminho (Agora não, ativado, negado). */
  onDone?: () => void;
}

type Phase =
  | { kind: "ask" }
  | { kind: "busy" }
  | { kind: "enabled" }
  | { kind: "denied" }
  | { kind: "error"; error: EnableError };

/**
 * C09 · Pré-prompt de notificações (spec §7.4, D-P09): painel inline logo abaixo da ação que o
 * disparou. "Ativar" chama o pedido nativo no gesto; "Agora não" nunca chama e silencia 14 dias.
 */
export function NotificationInvite({ trigger, onDone }: NotificationInviteProps) {
  const titleId = useId();
  const send = useTrack();
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    const t = window.setTimeout(() => {
      tracked.current = true;
      void send("notif_preprompt_shown", { trigger });
    }, SHOWN_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [send, trigger]);

  const refuse = () => {
    const s = readAppState();
    if (s) {
      const next = recordRefusal(s, "notif", new Date());
      writeAppState(next);
      void send("notif_preprompt_dismissed", {
        trigger,
        refusals: Math.min(3, next.notif.refusals) as 1 | 2 | 3,
      });
    }
    onDone?.();
  };

  const enable = async () => {
    setPhase({ kind: "busy" });
    const r = await enablePush(trigger);
    if (r.ok) setPhase({ kind: "enabled" });
    else if (r.error === "denied") {
      // Permissão negada no diálogo nativo: nunca mais pré-prompt neste navegador.
      const s = readAppState();
      if (s) writeAppState({ ...s, notif: { ...s.notif, refusals: 3 } });
      setPhase({ kind: "denied" });
    } else setPhase({ kind: "error", error: r.error });
  };

  if (phase.kind === "enabled")
    return (
      <InlineAlert tone="success" role="status">
        <p>
          {T.invite.enabled.replace(T.invite.enabledLink + ".", "")}
          <Link href="/alertas" className="font-semibold text-link underline underline-offset-4">
            {T.invite.enabledLink}
          </Link>
          .
        </p>
      </InlineAlert>
    );
  if (phase.kind === "denied")
    return (
      <InlineAlert tone="info" role="status">
        <p>{T.invite.denied}</p>
      </InlineAlert>
    );

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      className="flex flex-col gap-3 border border-line-strong bg-card-white p-4"
    >
      <h2 id={titleId} className="type-headline-sm text-strong">
        {T.invite.title}
      </h2>
      <p className="type-body text-body">{T.invite.body}</p>
      {phase.kind === "error" && (
        <InlineAlert tone="error" role="alert">
          <p>{phase.error === "rate_limited" ? T.invite.rateLimited : T.invite.failed}</p>
        </InlineAlert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="md" onClick={() => void enable()} disabled={phase.kind === "busy"}>
          {phase.kind === "error" ? T.invite.retry : T.invite.enable}
        </Button>
        <Button size="md" variant="outline" onClick={refuse} disabled={phase.kind === "busy"}>
          {T.invite.notNow}
        </Button>
      </div>
    </section>
  );
}
