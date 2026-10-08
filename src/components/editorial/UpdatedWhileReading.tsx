"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatHour } from "@/lib/format/date";
import { fetchJson } from "@/lib/http/fetch-json";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { Icon } from "../ui/Icon";

export interface UpdatedWhileReadingProps {
  /** Rota que responde `{ updatedAt }`. */
  endpoint: string;
  /** `updated_at` que o leitor está vendo. */
  updatedAt: string;
  historyHref: string;
  /** Intervalo de consulta (padrão 120 s, P1 Review Focus 1). */
  intervalMs?: number;
}

/**
 * Aviso fixo "Esta matéria foi atualizada às hh:mm · ver o que mudou" (P03): consulta o
 * `updated_at` a cada 120 s com a aba visível e avisa uma vez, sem recarregar sozinho.
 *
 * ```tsx
 * <UpdatedWhileReading endpoint="/api/materia/x/atualizacao" updatedAt={a.updatedAt} historyHref="/materia/x/historico" />
 * ```
 */
export function UpdatedWhileReading({
  endpoint,
  updatedAt,
  historyHref,
  intervalMs = 120_000,
}: UpdatedWhileReadingProps) {
  const [newer, setNewer] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = new Date(updatedAt).getTime();
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      // Com prazo (item 83); falha ou rede lenta: tenta no próximo intervalo.
      const r = await fetchJson(endpoint);
      if (!r.ok) return;
      const body = r.value;
      const next =
        typeof body === "object" && body !== null && "updatedAt" in body
          ? String(body.updatedAt)
          : "";
      const t = new Date(next).getTime();
      if (alive && Number.isFinite(t) && t > seen) setNewer(next);
    };
    const timer = window.setInterval(check, intervalMs);
    if (box.current) box.current.dataset.polling = "on";
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [endpoint, updatedAt, intervalMs]);

  return (
    <div
      ref={box}
      data-polling="off"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--h-tabbar)+var(--sp-12))] z-toast flex justify-center px-gutter lg:bottom-6"
    >
      {newer && (
        <div
          role="status"
          className="pointer-events-auto flex max-w-read flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-inverse px-5 py-3 text-on-inverse shadow-dialog"
        >
          <span className="inline-flex items-center gap-2 text-16 font-semibold">
            <Icon name="refresh-cw" size={18} />
            {ARTICLE.updatedWhileReading(formatHour(newer))}
          </span>
          <Link
            href={historyHref}
            className="inline-flex min-h-tap items-center text-14 font-semibold text-on-inverse underline underline-offset-4"
          >
            {ARTICLE.seeChanges.toLowerCase()}
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-tap cursor-pointer items-center text-14 font-semibold text-on-inverse underline underline-offset-4"
          >
            {ARTICLE.reload}
          </button>
        </div>
      )}
    </div>
  );
}
