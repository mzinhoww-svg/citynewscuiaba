"use client";

import { useState } from "react";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface ShareSheetProps {
  title: string;
  /** Caminho ou URL absoluta; caminho é completado com a origem da página. */
  url: string;
  /** Título da folha (padrão "Compartilhar matéria"). */
  sheetTitle?: string;
  /** Abaixo de 640 px o botão mostra só o ícone (barra de ações da matéria). */
  collapseLabel?: boolean;
  buttonSize?: "md" | "sm";
  className?: string;
}

const linkClass =
  "flex min-h-tap items-center gap-3 rounded-lg border border-line-control px-4 text-16 font-semibold text-strong no-underline hover:bg-section";

/**
 * Compartilhar (P03): usa o compartilhamento nativo do aparelho quando existe; senão, folha com
 * WhatsApp, e-mail e copiar link. Nenhum script de rede social é carregado.
 *
 * ```tsx
 * <ShareSheet title={article.title} url={article.href} />
 * ```
 */
export function ShareSheet({
  title,
  url,
  sheetTitle,
  collapseLabel,
  buttonSize = "md",
  className,
}: ShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(url);

  const onShare = async () => {
    const absolute = new URL(url, window.location.origin).toString();
    setFull(absolute);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: absolute });
        return;
      } catch {
        // Cancelado ou recusado: cai na folha.
      }
    }
    setCopied(false);
    setOpen(true);
  };

  const text = encodeURIComponent(`${title} ${full}`);
  return (
    <>
      <Button
        variant="outline"
        size={buttonSize}
        icon="share-2"
        collapseLabel={collapseLabel}
        onClick={onShare}
        className={className}
      >
        {ARTICLE.share}
      </Button>
      <BottomSheet
        open={open}
        title={sheetTitle ?? ARTICLE.shareTitle}
        onClose={() => setOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <a
            href={`https://wa.me/?text=${text}`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <Icon name="message-circle" size={20} />
            {ARTICLE.shareWhatsapp}
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(full)}`}
            className={linkClass}
          >
            <Icon name="mail" size={20} />
            {ARTICLE.shareEmail}
          </a>
          <button
            type="button"
            className={`${linkClass} cursor-pointer bg-transparent`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(full);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Icon name="link" size={20} />
            {ARTICLE.copyLink}
          </button>
          <p aria-live="polite" className="type-meta text-service">
            {copied && ARTICLE.copied}
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
