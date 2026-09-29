"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

type Reply = { ok: boolean; message: string };

export interface ExperimentControlsProps {
  id: string;
  status: "draft" | "running" | "ended";
  variantCount: number;
  winner: number | null;
  /** Só admin e operador_ia mexem; os demais só veem. */
  canManage: boolean;
  start: (input: { id: string }) => Promise<Reply>;
  end: (input: { id: string; winner: number | null }) => Promise<Reply>;
  promote: (input: { id: string; justification: string }) => Promise<Reply>;
}

/** Ações do teste: iniciar, encerrar (com vencedora) e promover a vencedora (pede aprovação). */
export function ExperimentControls({
  id,
  status,
  variantCount,
  winner,
  canManage,
  start,
  end,
  promote,
}: ExperimentControlsProps) {
  const uid = useId();
  const router = useRouter();
  const [reply, setReply] = useState<Reply | null>(null);
  const [pick, setPick] = useState<string>("none");
  const [why, setWhy] = useState("");
  const [pending, run] = useTransition();

  const go = (fn: () => Promise<Reply>) =>
    run(async () => {
      const r = await fn();
      setReply(r);
      if (r.ok) router.refresh();
    });

  if (!canManage) return null;
  return (
    <div className="flex flex-col gap-4">
      {status === "draft" && (
        <div>
          <Button
            variant="primary"
            size="md"
            disabled={pending}
            onClick={() => go(() => start({ id }))}
          >
            {T.start}
          </Button>
        </div>
      )}
      {status === "running" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-w`} className="type-label text-16 text-strong">
              {T.endWinner}
            </label>
            <select
              id={`${uid}-w`}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="border-control h-tap rounded-lg bg-input px-4 type-body text-strong"
            >
              <option value="none">{T.endNone}</option>
              {Array.from({ length: variantCount }, (_, i) => (
                <option key={i} value={String(i)}>
                  {T.variantLabel(i, i === 0)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline-strong"
            size="md"
            disabled={pending}
            onClick={() => go(() => end({ id, winner: pick === "none" ? null : Number(pick) }))}
          >
            {T.end}
          </Button>
        </div>
      )}
      {status === "ended" && winner !== null && (
        <div className="flex flex-col gap-2">
          <p className="type-meta text-meta">{T.promoteHint}</p>
          <label htmlFor={`${uid}-j`} className="type-label text-16 text-strong">
            {T.justificationLabel}
          </label>
          <textarea
            id={`${uid}-j`}
            rows={2}
            maxLength={2000}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <div>
            <Button
              variant="primary"
              size="md"
              disabled={pending || why.trim() === ""}
              onClick={() => go(() => promote({ id, justification: why }))}
            >
              {T.promote}
            </Button>
          </div>
        </div>
      )}
      {reply && (
        <InlineAlert tone={reply.ok ? "success" : "error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </InlineAlert>
      )}
    </div>
  );
}
