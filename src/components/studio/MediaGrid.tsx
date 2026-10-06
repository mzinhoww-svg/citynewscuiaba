"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MEDIA_FLOW_TEXT as F } from "@/content/pt-BR/studio-flow";
import type { Label } from "@/lib/labels";
import { cx } from "../cx";
import { OriginLabel } from "../editorial/OriginLabel";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { MediaThumb } from "./MediaThumb";
import type { ActionReply } from "./QueueTable";

export interface MediaGridItem {
  id: string;
  href: string;
  previewSrc: string;
  credit: string;
  label: Label;
  status: string;
  risk: string;
  licenseNote: string | null;
  licenseWarn: boolean;
}

export interface MediaGridProps {
  items: MediaGridItem[];
  /**
   * Aprovação em lote (item 46): com ela, cada cartão ganha uma caixa de seleção e a barra
   * "Aprovar selecionadas" aparece com a seleção. Cada imagem passa pela mesma regra da
   * aprovação individual no servidor (bloqueada ou com licença vencida não é aprovada).
   */
  approveMany?: (i: { ids: string[] }) => Promise<ActionReply>;
  className?: string;
}

/**
 * Grade da biblioteca de mídia (E09): prévia, rótulo de origem da imagem, crédito, estado, risco
 * e vigência da licença. O card inteiro é um link para a aprovação (título dentro do `<a>`); a
 * caixa de seleção fica acima do link, fora da área dele.
 */
export function MediaGrid({ items, approveMany, className }: MediaGridProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();
  const ids = items.filter((m) => selected.has(m.id)).map((m) => m.id);
  const all = items.length > 0 && ids.length === items.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const approve = () => {
    if (!approveMany || ids.length === 0) return;
    start(async () => {
      const r = await approveMany({ ids });
      setReply(r);
      if (r.ok) setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {approveMany && (
        <>
          <p role="status" aria-live="polite" className="type-body empty:hidden">
            {reply && (
              <span
                className={cx(
                  "inline-flex items-start gap-2",
                  reply.ok ? "text-service" : "text-danger",
                )}
              >
                <Icon name={reply.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
                {reply.message}
              </span>
            )}
          </p>
          <Checkbox
            name="todas"
            label={F.selectAll}
            checked={all}
            onChange={(on) => setSelected(on ? new Set(items.map((m) => m.id)) : new Set())}
          />
        </>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((m) => (
          <li
            key={m.id}
            className={cx(
              "relative flex flex-col gap-2 rounded-lg border bg-card-white p-3 hover:border-line-control",
              selected.has(m.id) ? "border-line-control" : "border-line-subtle",
            )}
          >
            <MediaThumb src={m.previewSrc} alt={m.credit} />
            <OriginLabel label={m.label} />
            <Link
              href={m.href}
              className="type-body font-semibold text-strong underline-offset-4 after:absolute after:inset-0 hover:underline"
            >
              {m.credit}
            </Link>
            <p className="type-meta text-meta">
              {m.status} · {m.risk}
            </p>
            {m.licenseNote && (
              <p
                className={cx("type-meta", m.licenseWarn ? "font-semibold text-warn" : "text-meta")}
              >
                {m.licenseNote}
              </p>
            )}
            {approveMany && (
              // Depois do link na ordem do documento: fica por cima da área clicável do cartão.
              <Checkbox
                name="selecionada"
                label={<span className="sr-only">{F.select(m.credit)}</span>}
                checked={selected.has(m.id)}
                onChange={(on) => toggle(m.id, on)}
                className="absolute top-4 left-4 rounded-sm bg-card-white px-2"
              />
            )}
          </li>
        ))}
      </ul>
      {approveMany && ids.length > 0 && (
        <div className="sticky bottom-0 z-sticky bg-page pb-safe">
          <div
            role="group"
            aria-label={F.bulkLabel}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line-control bg-card-white p-4"
          >
            <p className="type-meta text-meta">{F.selected(ids.length)}</p>
            <Button size="md" icon="check" disabled={pending} onClick={approve}>
              {F.approveSelected(ids.length)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
