"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { MODERATION_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Select, type SelectOption } from "../ui/Select";
import { TextField } from "../ui/TextField";
import type { ActionReply } from "./QueueTable";

export interface SubmissionReviewProps {
  id: string;
  initial: { title: string; startsAt: string; venue: string; description: string };
  categories: readonly SelectOption[];
  approve?: (i: {
    id: string;
    edits: {
      title: string;
      startsAt: string;
      venue: string;
      category: string;
      description: string | null;
    };
  }) => Promise<ActionReply>;
  reject?: (i: { id: string; reason: string }) => Promise<ActionReply>;
  /** Depois da decisão a sugestão sai da fila: a página mostra o aviso por estes endereços. */
  doneHref: { approved: string; rejected: string };
  className?: string;
}

/** Revisar, editar, aprovar ou rejeitar (motivo ao remetente) uma sugestão de evento (E13). */
export function SubmissionReview({
  id,
  initial,
  categories,
  approve,
  reject,
  doneHref,
  className,
}: SubmissionReviewProps) {
  const router = useRouter();
  const uid = useId();
  const [f, setF] = useState({ ...initial, category: "" });
  const [catError, setCatError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();
  const done = (r: ActionReply, href: string) => {
    setReply(r);
    if (r.ok) router.replace(href);
  };

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          id={`${uid}-titulo`}
          label={T.fields.title}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
        <TextField
          id={`${uid}-inicio`}
          label={T.fields.startsAt}
          value={f.startsAt}
          onChange={(e) => setF({ ...f, startsAt: e.target.value })}
        />
        <TextField
          id={`${uid}-local`}
          label={T.fields.venue}
          value={f.venue}
          onChange={(e) => setF({ ...f, venue: e.target.value })}
        />
        <Select
          id={`${uid}-categoria`}
          name="categoria"
          label={T.fields.category}
          options={categories}
          placeholder="—"
          value={f.category}
          error={catError ?? undefined}
          onChange={(v) => {
            setF({ ...f, category: v });
            setCatError(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-desc`} className="type-label text-16 text-strong">
          {T.fields.description}
        </label>
        <textarea
          id={`${uid}-desc`}
          rows={2}
          maxLength={2000}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
      </div>
      <p role="status" aria-live="polite" className="type-body">
        {reply && (
          <span className={reply.ok ? "text-service" : "text-danger"}>{reply.message}</span>
        )}
      </p>
      {approve && reject && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="md"
            disabled={pending}
            onClick={() => {
              if (!f.category) {
                setCatError(T.fields.category);
                return;
              }
              start(async () =>
                done(
                  await approve({
                    id,
                    edits: {
                      title: f.title,
                      startsAt: f.startsAt,
                      venue: f.venue,
                      category: f.category,
                      description: f.description || null,
                    },
                  }),
                  doneHref.approved,
                ),
              );
            }}
          >
            {T.approve}
          </Button>
          <Button size="md" variant="outline" disabled={pending} onClick={() => setAsking(true)}>
            {T.reject}
          </Button>
        </div>
      )}
      <Dialog
        open={asking}
        title={T.rejectTitle}
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button
              size="md"
              fullWidth
              disabled={pending}
              onClick={() => {
                if (!reason.trim()) {
                  setReasonError(T.reasonRequired);
                  return;
                }
                start(async () => {
                  const r = await reject!({ id, reason });
                  setAsking(false);
                  done(r, doneHref.rejected);
                });
              }}
            >
              {T.confirm}
            </Button>
            <Button size="md" variant="text" onClick={() => setAsking(false)}>
              {T.cancel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-left">
          <label htmlFor={`${uid}-motivo`} className="type-label text-16 text-strong">
            {T.reasonLabel}
          </label>
          <textarea
            id={`${uid}-motivo`}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${uid}-erro` : `${uid}-dica`}
            className={cx(
              "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
              reasonError && "field-error",
            )}
          />
          {reasonError ? (
            <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
              {reasonError}
            </p>
          ) : (
            <p id={`${uid}-dica`} className="type-meta text-meta">
              {T.reasonHint}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
