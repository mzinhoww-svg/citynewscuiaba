"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { MODERATION_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import type { ActionReply } from "./QueueTable";

export interface ReportResponderProps {
  id: string;
  label: string;
  respond: (i: { id: string; response: string }) => Promise<ActionReply>;
  /** Depois de responder, a denúncia sai da fila: a página mostra o aviso por este endereço. */
  doneHref: string;
  className?: string;
}

/** Resposta ao leitor numa denúncia (E14): registrada e enviada quando há contato. */
export function ReportResponder({ id, label, respond, doneHref, className }: ReportResponderProps) {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={cx("flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) {
          setError(T.responseRequired);
          return;
        }
        start(async () => {
          const r = await respond({ id, response: text });
          setReply(r);
          if (r.ok) router.replace(doneHref);
        });
      }}
    >
      <label htmlFor={`${uid}-resposta`} className="type-label text-strong">
        {T.responseLabel}
        <span className="sr-only">: {label}</span>
      </label>
      <textarea
        id={`${uid}-resposta`}
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${uid}-erro` : `${uid}-dica`}
        className={cx(
          "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
          error && "field-error",
        )}
      />
      {error ? (
        <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
          {error}
        </p>
      ) : (
        <p id={`${uid}-dica`} className="type-meta text-meta">
          {T.responseHint}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {T.send}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="type-meta">
        {reply && (
          <span className={reply.ok ? "text-service" : "text-danger"}>{reply.message}</span>
        )}
      </p>
    </form>
  );
}
