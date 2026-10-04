"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AB_TEXT as T } from "@/content/pt-BR/recommendation-admin";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import type { RecReply } from "./WeightSliders";

export interface AbTestCardProps {
  id: string;
  status: string;
  variants: { index: number; name: string; weightsVersion: string }[];
  canManage: boolean;
  end: (i: { id: string }) => Promise<RecReply>;
  promote: (i: { id: string; variant: number; justification: string }) => Promise<RecReply>;
  className?: string;
}

/** Ações do teste A/B (O18): encerrar e promover a vencedora (abre pedido `rec.weights`). */
export function AbTestCard({
  id,
  status,
  variants,
  canManage,
  end,
  promote,
  className,
}: AbTestCardProps) {
  const uid = useId();
  const router = useRouter();
  const [promoting, setPromoting] = useState<number | null>(null);
  const [justification, setJustification] = useState("");
  const [reply, setReply] = useState<RecReply | null>(null);
  const [busy, start] = useTransition();
  const done = (r: RecReply) => {
    setReply(r);
    if (r.ok) {
      setPromoting(null);
      setJustification("");
      router.refresh();
    }
  };
  if (!canManage) return <p className={cx("type-meta text-meta", className)}>{T.readOnly}</p>;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {status === "running" && (
        <div className="flex flex-wrap gap-3">
          <Button
            size="md"
            variant="outline-strong"
            icon="circle-pause"
            disabled={busy}
            onClick={() => start(async () => done(await end({ id })))}
          >
            {busy ? T.ending : T.end}
          </Button>
          {variants.map((v) => (
            <Button
              key={v.index}
              size="md"
              icon="trending-up"
              disabled={busy}
              onClick={() => setPromoting(v.index)}
            >
              {T.promote(v.name)}
            </Button>
          ))}
        </div>
      )}
      <p
        role={reply && !reply.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
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
      {promoting !== null && (
        <Dialog
          open
          title={T.promote(variants[promoting]?.name ?? "")}
          onClose={() => setPromoting(null)}
          actions={
            <>
              <Button size="md" variant="outline" onClick={() => setPromoting(null)}>
                Cancelar
              </Button>
              <Button
                size="md"
                disabled={busy}
                onClick={() => {
                  if (!justification.trim())
                    return setReply({ ok: false, message: T.promoteJustification });
                  start(async () =>
                    done(
                      await promote({
                        id,
                        variant: promoting,
                        justification: justification.trim(),
                      }),
                    ),
                  );
                }}
              >
                {T.promote(variants[promoting]?.name ?? "")}
              </Button>
            </>
          }
        >
          <p className="text-left type-meta text-meta">{T.promoteHint}</p>
          <label htmlFor={`${uid}-just`} className="mt-3 block text-left type-label text-strong">
            {T.promoteJustification}
          </label>
          <textarea
            id={`${uid}-just`}
            rows={3}
            required
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="border-control mt-2 min-h-20 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
        </Dialog>
      )}
    </div>
  );
}
