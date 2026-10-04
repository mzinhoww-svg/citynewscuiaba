"use client";

import { useState, useTransition } from "react";
import { STUDIO_PUSH_CARD_TEXT as T } from "@/content/pt-BR/studio-notifications";
import { enablePush, pushSupport } from "@/lib/push/client";
import { Button } from "../../ui/Button";

export interface StaffUrgentOptInProps {
  /** A pessoa já tem urgências ligadas em alguma inscrição. */
  initialOn: boolean;
  /** Server Action (`setStaffAlertsAction`): liga ou desliga nas inscrições da própria pessoa. */
  action: (on: boolean) => Promise<{ ok: boolean; on: boolean }>;
  className?: string;
}

type Problem = "denied" | "unsupported" | "failed" | null;

/**
 * Opt-in do push de urgências da central, neste navegador. Reaproveita o fluxo de push do leitor
 * (permissão do navegador e inscrição com a sessão aberta, sem segundo canal). Só urgências, só
 * para quem liga aqui; desligar não mexe nos avisos do portal.
 */
export function StaffUrgentOptIn({ initialOn, action, className }: StaffUrgentOptInProps) {
  const [on, setOn] = useState(initialOn);
  const [problem, setProblem] = useState<Problem>(null);
  const [pending, start] = useTransition();

  const turnOn = () =>
    start(async () => {
      setProblem(null);
      const support = pushSupport();
      if (support === "unsupported" || support === "no_keys" || support === "ios_needs_install") {
        setProblem("unsupported");
        return;
      }
      if (support === "denied") {
        setProblem("denied");
        return;
      }
      const r = await enablePush("settings");
      if (!r.ok) {
        setProblem(r.error === "denied" ? "denied" : "failed");
        return;
      }
      const saved = await action(true);
      if (saved.ok && saved.on) setOn(true);
      else setProblem("failed");
    });

  const turnOff = () =>
    start(async () => {
      setProblem(null);
      const saved = await action(false);
      if (saved.ok) setOn(false);
      else setProblem("failed");
    });

  return (
    <div className={className}>
      <h3 className="text-16 font-semibold text-strong">{T.optInTitle}</h3>
      <p className="max-w-read type-body text-meta">{T.optInBody}</p>
      {on && <p className="mt-1 type-body font-semibold text-service">{T.optInOn}</p>}
      <div className="mt-2">
        <Button
          size="md"
          variant={on ? "outline" : "primary"}
          disabled={pending}
          onClick={on ? turnOff : turnOn}
        >
          {on ? T.disable : T.enable}
        </Button>
      </div>
      <p aria-live="polite" className="mt-1 type-meta text-danger">
        {problem === "denied" && T.denied}
        {problem === "unsupported" && T.unsupported}
        {problem === "failed" && T.failed}
      </p>
    </div>
  );
}
