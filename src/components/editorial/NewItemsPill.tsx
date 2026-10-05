"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SECTION_PAGE } from "@/content/pt-BR/portal-section";
import { cx } from "../cx";
import { Button } from "../ui/Button";

export interface NewItemsPillProps {
  /** Rota que responde `{ count: number }` com as novas desde o carregamento. */
  endpoint: string;
  /** Intervalo de consulta (padrão 60 s, docs/screens.md P02). */
  intervalMs?: number;
  /** Id da lista para onde a página rola ao mostrar as novas. */
  targetId?: string;
  className?: string;
}

/**
 * Pílula "n novas matérias · mostrar" da editoria: consulta a contagem a cada 60 s (só com a
 * aba visível) e, no clique, recarrega a lista sem perder filtros. O aviso é anunciado com
 * `aria-live="polite"`.
 *
 * ```tsx
 * <NewItemsPill endpoint={`/api/editoria/cidade/novas?desde=${latestAt}`} targetId="lista" />
 * ```
 */
export function NewItemsPill({
  endpoint,
  intervalMs = 60_000,
  targetId,
  className,
}: NewItemsPillProps) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const body: unknown = await res.json();
        const n =
          typeof body === "object" && body !== null && "count" in body ? Number(body.count) : 0;
        if (alive && Number.isFinite(n)) setCount(n);
      } catch {
        // Sem rede: tenta de novo no próximo intervalo.
      }
    };
    const timer = window.setInterval(check, intervalMs);
    if (box.current) box.current.dataset.polling = "on";
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [endpoint, intervalMs]);

  return (
    <div
      aria-live="polite"
      ref={box}
      data-polling="off"
      className={cx("flex justify-center", className)}
    >
      {count > 0 && (
        <Button
          size="md"
          icon="arrow-up"
          onClick={() => {
            setCount(0);
            router.refresh();
            if (targetId) document.getElementById(targetId)?.scrollIntoView({ block: "start" });
          }}
        >
          {SECTION_PAGE.newItems(count)}
        </Button>
      )}
    </div>
  );
}
