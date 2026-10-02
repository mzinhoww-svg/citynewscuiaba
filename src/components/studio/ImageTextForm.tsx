"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { IMAGE_TEXT as T } from "@/content/pt-BR/studio";
import { ALT_MAX, CAPTION_MAX, imageTextError } from "@/lib/studio/image-text";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import type { ActionReply } from "./QueueTable";

export interface ImageTextFormProps {
  articleId: string;
  mediaId: string;
  /** `null` = ainda não escrito; `""` = decorativa. */
  alt: string | null;
  caption: string | null;
  /** Título da seção (ex.: nome da matéria no detalhe da imagem). */
  heading: string;
  /** Sem `save`, mostra só os valores (quem não edita a matéria). */
  save?: (i: {
    articleId: string;
    mediaId: string;
    alt: string;
    caption: string;
    decorative: boolean;
  }) => Promise<ActionReply>;
  className?: string;
}

/**
 * Texto alternativo e legenda da imagem numa matéria (E04, E10). "Imagem decorativa" grava alt
 * vazio de propósito; sem ela, o texto alternativo é obrigatório (até 250 caracteres).
 */
export function ImageTextForm({
  articleId,
  mediaId,
  alt,
  caption,
  heading,
  save,
  className,
}: ImageTextFormProps) {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState(alt ?? "");
  const [legend, setLegend] = useState(caption ?? "");
  const [decorative, setDecorative] = useState(alt === "");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();

  if (!save) {
    return (
      <div className={cx("flex flex-col gap-1", className)}>
        <h3 className="type-label text-16 text-strong">{heading}</h3>
        <p className="type-body text-body">
          {alt === "" ? T.decorativeShort : alt ? alt : T.missing}
        </p>
        {caption && <p className="type-meta text-meta">{caption}</p>}
      </div>
    );
  }

  const submit = () => {
    const input = { articleId, mediaId, alt: text, caption: legend, decorative };
    const problem = imageTextError(input);
    if (problem) {
      setError(problem);
      return;
    }
    start(async () => {
      const r = await save(input);
      if (r.ok) {
        setError(null);
        setReply(r);
        router.refresh();
      } else setError(r.message);
    });
  };

  return (
    <form
      aria-labelledby={`${uid}-titulo`}
      className={cx("flex flex-col gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 id={`${uid}-titulo`} className="type-label text-16 text-strong">
        {heading}
      </h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-alt`} className="type-label text-16 text-strong">
          {T.alt}
        </label>
        <textarea
          id={`${uid}-alt`}
          rows={3}
          maxLength={ALT_MAX}
          value={decorative ? "" : text}
          disabled={decorative}
          aria-required={!decorative}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${uid}-dica ${uid}-conta${error ? ` ${uid}-erro` : ""}`}
          className={cx(
            "border-control rounded-lg bg-input px-4 py-3 type-body text-strong disabled:opacity-60",
            error && "field-error",
          )}
        />
        <p id={`${uid}-dica`} className="type-meta text-meta">
          {T.altHint}
        </p>
        <p id={`${uid}-conta`} className="type-meta text-meta">
          {T.count(decorative ? 0 : text.length, ALT_MAX)}
        </p>
      </div>
      <label
        htmlFor={`${uid}-decorativa`}
        className="flex min-h-tap cursor-pointer items-start gap-3 type-body"
      >
        <input
          id={`${uid}-decorativa`}
          type="checkbox"
          checked={decorative}
          onChange={(e) => {
            setDecorative(e.target.checked);
            if (error) setError(null);
          }}
          className="mt-0.5 size-5 shrink-0 accent-(--action-primary)"
        />
        <span className="text-body">{T.decorative}</span>
      </label>
      <TextField
        id={`${uid}-legenda`}
        label={T.caption}
        hint={T.captionHint}
        maxLength={CAPTION_MAX}
        value={legend}
        onChange={(e) => setLegend(e.target.value)}
      />
      {error && (
        <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="type-meta text-service">
        {reply?.ok ? reply.message : ""}
      </p>
      <div>
        <Button type="submit" size="md" variant="outline" disabled={pending}>
          {T.save}
        </Button>
      </div>
    </form>
  );
}
