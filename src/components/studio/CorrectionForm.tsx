"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CORRECTIONS_TEXT as C, EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { VersionDiff } from "../editorial/VersionDiff";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";
import type { SaveReply } from "./ArticleEditor";
import { RichEditor } from "./editor/Editor";

export interface CorrectionFormProps {
  /** Correção (nota + aviso a quem salvou) ou Atualização (fato novo + nota). */
  mode: "correction" | "update";
  targetId: string;
  baseVersion: number;
  userId: string;
  initial: { title: string; dek: string; body: JSONContent };
  submit: (i: {
    id: string;
    baseVersion: number;
    doc: { title: string; dek: string; body: JSONContent };
    publicNote: string;
    notifySavers: boolean;
  }) => Promise<SaveReply>;
  className?: string;
}

/**
 * Mudança em matéria publicada (E04 modos, E08): campos corrigidos, nota pública obrigatória e,
 * na correção, "Avisar quem salvou a matéria". Conflito de versão mostra o diff, sem publicar.
 */
export function CorrectionForm({
  mode,
  targetId,
  baseVersion,
  userId,
  initial,
  submit,
  className,
}: CorrectionFormProps) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState(initial.title);
  const [dek, setDek] = useState(initial.dek);
  const [body, setBody] = useState<JSONContent>(initial.body);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveReply | null>(null);
  const [pending, start] = useTransition();
  const correction = mode === "correction";

  const send = () => {
    if (!note.trim()) {
      setNoteError(correction ? C.noteRequired : C.updateNoteRequired);
      return;
    }
    start(async () => {
      const r = await submit({
        id: targetId,
        baseVersion,
        doc: { title, dek, body },
        publicNote: note,
        notifySavers: correction && notify,
      });
      setStatus(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <form
      className={cx("flex flex-col gap-5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <p className="type-meta text-meta">{C.fieldsHint}</p>
      <TextField
        id={`${uid}-titulo`}
        label={T.fields.title}
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-linha`} className="type-label text-strong">
          {T.fields.dek}
        </label>
        <textarea
          id={`${uid}-linha`}
          rows={2}
          maxLength={400}
          value={dek}
          onChange={(e) => setDek(e.target.value)}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
      </div>
      <RichEditor label={T.fields.body} value={body} userId={userId} onChange={setBody} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-nota`} className="type-label text-strong">
          {correction ? C.publicNote : C.updateNote}
        </label>
        <textarea
          id={`${uid}-nota`}
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (noteError) setNoteError(null);
          }}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? `${uid}-nota-erro` : `${uid}-nota-dica`}
          className={cx(
            "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
            noteError && "field-error",
          )}
        />
        {noteError ? (
          <p id={`${uid}-nota-erro`} role="alert" className="flex gap-1.5 type-meta text-danger">
            <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
            {noteError}
          </p>
        ) : (
          <p id={`${uid}-nota-dica`} className="type-meta text-meta">
            {correction ? C.publicNoteHint : C.updateNoteHint}
          </p>
        )}
      </div>
      {correction && (
        <Checkbox
          id={`${uid}-avisar`}
          name="avisar"
          label={C.notify}
          hint={C.notifyHint}
          checked={notify}
          onChange={setNotify}
        />
      )}
      <p role="status" aria-live="polite" className="type-body">
        {status?.ok && <span className="text-service">{status.message}</span>}
      </p>
      {status && !status.ok && (
        <InlineAlert
          tone="error"
          role="alert"
          title={status.conflict ? T.conflictTitle : undefined}
        >
          <p>{status.message}</p>
          {status.conflict &&
            (["title", "dek", "body"] as const).map((k) =>
              status.conflict!.diff[k].some((o) => o.op !== "eq") ? (
                <div key={k} className="mt-2">
                  <p className="type-eyebrow text-meta">{T.fields[k]}</p>
                  <VersionDiff
                    parts={status.conflict!.diff[k].map((o) => ({
                      type: o.op === "eq" ? "same" : o.op,
                      text: o.text,
                    }))}
                  />
                </div>
              ) : null,
            )}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" size="md" disabled={pending || status?.ok === true}>
          {correction ? C.submit : C.updateSubmit}
        </Button>
      </div>
    </form>
  );
}
