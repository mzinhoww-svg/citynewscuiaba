"use client";

import { useEffect, useId, useRef } from "react";
import { IOS_STEPS_TEXT as T } from "@/content/pt-BR/app";
import { Button } from "../ui/Button";

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
 * C08 · Passos no iPhone (spec §7.3): diálogo nativo com foco preso e devolvido; "Agora não"
 * conta como recusa da instalação; Esc equivale a fechar sem contar.
 */
export function IosInstallSteps({ open, safari, onClose }: IosInstallStepsProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const chose = useRef<"ok" | "not_now" | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      chose.current = null;
      el.showModal?.();
    }
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;
  const close = (reason: "ok" | "not_now") => {
    chose.current = reason;
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={() => onClose(chose.current ?? "dismiss")}
      className="m-auto w-[min(100%-2rem,28rem)] rounded-xl border border-line-section bg-card-white p-6 text-body shadow-dialog backdrop:bg-overlay"
    >
      <h2 id={titleId} className="type-section text-strong">
        {T.title}
      </h2>
      <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 type-body">
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
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button size="md" variant="outline" onClick={() => close("not_now")}>
          {T.notNow}
        </Button>
        <Button size="md" onClick={() => close("ok")}>
          {T.ok}
        </Button>
      </div>
    </dialog>
  );
}
