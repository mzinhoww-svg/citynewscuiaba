"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import type { SelectOption } from "../ui/Select";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Select } from "../ui/Select";
import type { ActionReply } from "./QueueTable";

export interface ImageApprovalProps {
  mediaId: string;
  status: "pending" | "approved" | "blocked";
  approve?: (i: { id: string }) => Promise<ActionReply>;
  block?: (i: { id: string; reason: string }) => Promise<ActionReply>;
  /** Matérias em que a pessoa pode trocar a imagem, com as imagens candidatas. */
  replace?: {
    articles: { id: string; title: string }[];
    options: readonly SelectOption[];
    run: (i: { articleId: string; mediaId: string }) => Promise<ActionReply>;
  };
  className?: string;
}

/**
 * Ações da aprovação de imagem (E10): Aprovar, Bloquear com motivo e Trocar imagem nas matérias
 * que a usam (troca sugerida quando a licença venceu). Resultado em `role="status"`.
 */
export function ImageApproval({
  mediaId,
  status,
  approve,
  block,
  replace,
  className,
}: ImageApprovalProps) {
  const router = useRouter();
  const uid = useId();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const done = (r: ActionReply) => {
    setReply(r);
    if (r.ok) router.refresh();
  };

  return (
    <section
      aria-labelledby={`${uid}-acoes`}
      className={cx(
        "flex flex-col gap-4 rounded-lg border border-line-subtle bg-card-white p-4",
        className,
      )}
    >
      <h2 id={`${uid}-acoes`} className="type-section text-strong">
        {T.approvalTitle}
      </h2>
      <p role="status" aria-live="polite" className="type-body">
        {reply && (
          <span className={reply.ok ? "text-service" : "text-danger"}>{reply.message}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {approve && status !== "approved" && (
          <Button
            size="md"
            disabled={pending}
            onClick={() => start(async () => done(await approve({ id: mediaId })))}
          >
            {T.approve}
          </Button>
        )}
        {block && status !== "blocked" && (
          <Button size="md" variant="outline" disabled={pending} onClick={() => setAsking(true)}>
            {T.block}
          </Button>
        )}
      </div>

      {replace && replace.articles.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
          <h3 className="type-label text-16 text-strong">{T.replace}</h3>
          {replace.articles.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-end gap-2">
              <Select
                id={`${uid}-troca-${i}`}
                name={`troca-${i}`}
                label={T.replaceFor(a.title)}
                options={replace.options}
                placeholder="—"
                value={choice[a.id] ?? ""}
                onChange={(v) => setChoice((c) => ({ ...c, [a.id]: v }))}
                className="min-w-0 flex-1"
              />
              <Button
                size="md"
                variant="outline"
                disabled={!choice[a.id] || pending}
                onClick={() =>
                  start(async () =>
                    done(await replace.run({ articleId: a.id, mediaId: choice[a.id]! })),
                  )
                }
              >
                {T.replace}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={asking}
        title={T.block}
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button
              size="md"
              fullWidth
              disabled={pending}
              onClick={() => {
                if (!reason.trim()) {
                  setError(T.reasonRequired);
                  return;
                }
                start(async () => {
                  const r = await block!({ id: mediaId, reason });
                  setAsking(false);
                  setReason("");
                  done(r);
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
            {T.blockReason}
          </label>
          <textarea
            id={`${uid}-motivo`}
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
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
              {T.blockReasonHint}
            </p>
          )}
        </div>
      </Dialog>
    </section>
  );
}
