"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import { diffPrompt, promptChanged, PROMPT_MAX_CHARS } from "@/lib/ai/prompt-diff";
import { VersionDiff } from "../editorial/VersionDiff";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export type PromptEditorReply = { ok: true; message: string } | { ok: false; message: string };

export interface PromptEditorProps {
  /** Texto do prompt em produção (ponto de partida e base do diff). */
  baseBody: string;
  save: (input: {
    body: string;
    rationale: string;
    propose: boolean;
  }) => Promise<PromptEditorReply>;
}

/**
 * Editor de nova versão de prompt (O12): parte da produção, mostra o diff palavra por palavra
 * enquanto se escreve e envia como rascunho ou já como proposta de publicação (aprovação de
 * outra pessoa). O texto é sempre exibido como texto, nunca como HTML.
 */
export function PromptEditor({ baseBody, save }: PromptEditorProps) {
  const router = useRouter();
  const uid = useId();
  const [body, setBody] = useState(baseBody);
  const [rationale, setRationale] = useState("");
  const [reply, setReply] = useState<PromptEditorReply | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = promptChanged(baseBody, body);
  const parts = useMemo(
    () =>
      changed
        ? diffPrompt(baseBody, body).map((o) => ({
            type: o.op === "eq" ? ("same" as const) : o.op,
            text: o.text,
          }))
        : [],
    [baseBody, body, changed],
  );
  const ready = changed && body.trim() !== "" && rationale.trim() !== "" && !pending;

  const submit = (propose: boolean) => {
    setReply(null);
    startTransition(async () => {
      const r = await save({ body, rationale, propose });
      setReply(r);
      if (r.ok) {
        setRationale("");
        router.refresh();
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit(true);
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-body`} className="type-label text-16 text-strong">
          {T.editorBodyLabel}
        </label>
        <textarea
          id={`${uid}-body`}
          rows={10}
          maxLength={PROMPT_MAX_CHARS}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${uid}-body-hint`}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${uid}-body-hint`} className="type-meta text-meta">
          {T.editorBodyHint(PROMPT_MAX_CHARS)}
        </p>
      </div>

      <section aria-labelledby={`${uid}-diff`} className="flex flex-col gap-2">
        <h3 id={`${uid}-diff`} className="type-label text-16 text-strong">
          {T.diffTitle}
        </h3>
        {changed ? (
          <div
            role="region"
            aria-label={T.diffCaption}
            tabIndex={0}
            className="max-h-[24rem] overflow-y-auto rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <VersionDiff parts={parts} className="max-w-none" />
          </div>
        ) : (
          <p className="type-body text-meta">{T.diffNone}</p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-why`} className="type-label text-16 text-strong">
          {T.editorWhyLabel}
        </label>
        <textarea
          id={`${uid}-why`}
          rows={3}
          maxLength={2000}
          required
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          aria-describedby={`${uid}-why-hint`}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${uid}-why-hint`} className="type-meta text-meta">
          {T.editorWhyHint}
        </p>
      </div>

      <div role="status" aria-live="polite">
        {reply && (
          <InlineAlert tone={reply.ok ? "success" : "error"} role="none">
            {reply.message}
          </InlineAlert>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" icon="file-check" disabled={!ready}>
          {pending ? T.saving : T.saveAndPropose}
        </Button>
        <Button
          type="button"
          size="md"
          variant="outline"
          disabled={!ready}
          onClick={() => submit(false)}
        >
          {T.saveDraft}
        </Button>
      </div>
    </form>
  );
}
