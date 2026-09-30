"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { queryCachedAt } from "@/lib/offline/sw";

// A faixa só carrega quando a página veio do cache (B-018).
const OfflineNoticeBar = lazy(() => import("./OfflineNoticeBar"));

export interface OfflineNoticeProps {
  /** Relógio injetável nos testes. */
  now?: () => Date;
  /** Consulta injetável nos testes (padrão: pergunta ao SW). */
  query?: (url: string) => Promise<string | null>;
}

/**
 * Faixa de cópia antiga (spec 2026-09-28 §7.8): em página servida do cache, "Salva às 14h32,
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
    <Suspense fallback={null}>
      <OfflineNoticeBar cachedAt={cachedAt} online={online} now={now} />
    </Suspense>
  );
}
