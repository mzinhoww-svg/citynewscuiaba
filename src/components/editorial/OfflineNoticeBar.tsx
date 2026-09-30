"use client";

import { OFFLINE_TEXT } from "@/content/pt-BR/offline";
import { staleLabel } from "@/sw/core";
import { Button } from "../ui/Button";

export interface OfflineNoticeBarProps {
  /** Quando a cópia foi salva (ISO). */
  cachedAt: string;
  /** A conexão voltou: troca o rótulo por "Conexão de volta." e o botão Atualizar. */
  online: boolean;
  now: () => Date;
}

/**
 * Faixa visível do `OfflineNotice`. Carrega sob demanda, só quando a página veio do cache
 * (B-018): quem navega com rede não baixa o texto nem o cálculo do rótulo.
 */
export default function OfflineNoticeBar({ cachedAt, online, now }: OfflineNoticeBarProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-section bg-section px-gutter py-3 type-meta text-meta"
    >
      {online ? (
        <>
          <span className="text-strong">{OFFLINE_TEXT.backOnline}</span>
          <Button size="sm" variant="outline" onClick={() => location.reload()}>
            {OFFLINE_TEXT.refresh}
          </Button>
        </>
      ) : (
        <span>{staleLabel(new Date(cachedAt), now())}</span>
      )}
    </div>
  );
}
