"use client";

import { useEffect, useRef } from "react";
import { IOS_STEPS_TEXT as T } from "@/content/pt-BR/app";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export interface IosInstallStepsProps {
  open: boolean;
  /** Fora do Safari (Chrome iOS), o passo 1 aponta a barra de endereço. */
  safari: boolean;
  onClose: (reason: "ok" | "not_now" | "dismiss") => void;
}

/** Ícone Compartilhar do iOS (quadrado com seta para cima), desenhado aqui, com texto ao lado. */
function ShareGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-text-bottom"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

/**
 * C08 · Passos no iPhone (spec §7.3): `Dialog` do kit (foco preso e devolvido); "Agora não"
 * conta como recusa da instalação; Esc, o X ou o toque fora equivalem a fechar sem contar.
 * `onClose` é chamado uma vez por abertura.
 */
export function IosInstallSteps({ open, safari, onClose }: IosInstallStepsProps) {
  const done = useRef(false);
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);

  if (!open) return null;
  const finish = (reason: "ok" | "not_now" | "dismiss") => {
    if (done.current) return;
    done.current = true;
    onClose(reason);
  };

  return (
    <Dialog
      wide
      title={T.title}
      onClose={() => finish("dismiss")}
      actions={
        <div className="flex w-full flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={() => finish("not_now")}>
            {T.notNow}
          </Button>
          <Button size="md" onClick={() => finish("ok")}>
            {T.ok}
          </Button>
        </div>
      }
    >
      <ol className="mt-2 flex list-decimal flex-col gap-3 pl-5 text-body">
        <li>
          <span className="inline-flex items-center gap-2">
            <ShareGlyph />
            <span>{safari ? T.step1Safari : T.step1Other}</span>
          </span>
        </li>
        <li>{T.step2}</li>
        <li>{T.step3}</li>
      </ol>
      <p className="mt-4 type-meta text-meta">{T.note}</p>
    </Dialog>
  );
}
