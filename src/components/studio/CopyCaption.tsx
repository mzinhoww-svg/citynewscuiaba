"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/TextArea";

export interface CopyCaptionProps {
  id: string;
  label: string;
  caption: string;
  /** "n de 2.200 caracteres" */
  hint: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
}

/**
 * Legenda pronta do pacote do Instagram (ARD-T6): campo só de leitura e o botão "Copiar
 * legenda", com o resultado anunciado numa região viva (sem depender só de cor).
 */
export function CopyCaption({
  id,
  label,
  caption,
  hint,
  copyLabel,
  copiedLabel,
  failedLabel,
}: CopyCaptionProps) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      setMessage(copiedLabel);
    } catch {
      setMessage(failedLabel);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <TextArea id={id} name={id} label={label} value={caption} readOnly rows={14} hint={hint} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="md" variant="secondary" icon="copy" onClick={copy}>
          {copyLabel}
        </Button>
        <p role="status" aria-live="polite" className="type-meta text-meta empty:hidden">
          {message}
        </p>
      </div>
    </div>
  );
}
