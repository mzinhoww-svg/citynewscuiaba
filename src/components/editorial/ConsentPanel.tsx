"use client";

import { useEffect, useRef } from "react";
import { CONSENT_TEXT } from "@/content/pt-BR/privacy-consent";
import type { ConsentChoice } from "@/lib/consent";
import { Button } from "../ui/Button";
import { ConsentChoices } from "./ConsentChoices";

export interface ConsentPanelProps {
  draft: ConsentChoice;
  onChange: (next: ConsentChoice) => void;
  onBack: () => void;
  onSave: (choice: ConsentChoice) => void;
}

/**
 * Painel "Escolher" do banner de consentimento: as categorias com interruptores. Carrega sob
 * demanda, quando o leitor toca em "Escolher" (B-018): quem só aceita ou recusa não baixa o
 * painel. Leva o foco ao título ao abrir e trata `Esc` como "Voltar".
 */
export default function ConsentPanel({ draft, onChange, onBack, onSave }: ConsentPanelProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <div
      className="mx-auto flex max-h-[70dvh] w-full max-w-page flex-col gap-3 overflow-y-auto px-gutter py-4 lg:px-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onBack();
        }
      }}
    >
      <h2 ref={title} tabIndex={-1} className="type-section text-strong">
        {CONSENT_TEXT.panelTitle}
      </h2>
      <p className="type-meta text-meta">{CONSENT_TEXT.panelIntro}</p>
      <ConsentChoices value={draft} onChange={onChange} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="md" onClick={onBack}>
          {CONSENT_TEXT.back}
        </Button>
        <Button size="md" onClick={() => onSave(draft)}>
          {CONSENT_TEXT.save}
        </Button>
      </div>
    </div>
  );
}
