"use client";

import { useEffect, useState } from "react";
import { OFFLINE_TEXT } from "@/content/pt-BR/offline";
import { queryCachedAt } from "@/lib/offline/sw";
import { staleLabel } from "@/sw/core";
import { Button } from "../ui/Button";

export interface OfflineNoticeProps {
  /** Relógio injetável nos testes. */
  now?: () => Date;
  /** Consulta injetável nos testes (padrão: pergunta ao SW). */
  query?: (url: string) => Promise<string | null>;
}

/**
 * Linha fina de cópia antiga (spec 2026-09-28 §7.8): em página servida do cache, "Salva às 14h32,
 * pode estar desatualizada." no topo; ao voltar a conexão, "Conexão de volta." + Atualizar.
 * Página que veio da rede não mostra nada.
 */
export function OfflineNotice({
  now = () => new Date(),
  query = queryCachedAt,
}: OfflineNoticeProps) {
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let alive = true;
    const url = `${location.pathname}${location.search}`;
    void query(url).then((at) => {
      if (alive) setCachedAt(at);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    if (!cachedAt) return;
    const onOnline = () => setOnline(true);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [cachedAt]);

  if (!cachedAt) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 border-b border-section bg-section px-gutter py-1.5 type-meta text-meta"
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
