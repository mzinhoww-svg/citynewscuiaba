"use client";

import { useId, useState, type KeyboardEvent, type Ref } from "react";
import { useHydrated } from "./useHydrated";
import { ASK } from "@/content/pt-BR/ask";
import { COUNTER_FROM, MAX_QUESTION } from "@/lib/ask";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface ChatComposerProps {
  onSend: (question: string) => void;
  /** Enquanto uma resposta chega: o campo aceita texto, mas não envia. */
  disabled?: boolean;
  max?: number;
  /**
   * Texto só do HTML do servidor: a pergunta de `?q=` fica no campo para quem está sem
   * JavaScript. Com JavaScript a pergunta já foi enviada e o campo começa vazio.
   */
  serverValue?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** `id` do formulário (as perguntas iniciais enviam por ele quando não há JavaScript). */
  formId?: string;
  className?: string;
}

/**
 * Campo de envio do chat (UI-T13): `Enter` envia, `Shift+Enter` quebra linha, contador a partir
 * de 250 caracteres (máximo 300), botão de enviar com nome acessível e o aviso fixo "Pode conter
 * erros. Confira nas fontes.". Sem JavaScript é um formulário `GET /pergunte?q=&modo=simples`,
 * respondido no servidor.
 *
 * ```tsx
 * <ChatComposer onSend={send} disabled={busy} />
 * ```
 */
export function ChatComposer({
  onSend,
  disabled = false,
  max = MAX_QUESTION,
  serverValue = "",
  inputRef,
  formId,
  className,
}: ChatComposerProps) {
  const id = useId();
  const [typed, setValue] = useState("");
  const hydrated = useHydrated();
  const value = hydrated ? typed : serverValue.slice(0, max);
  const counterId = `${id}-contador`;
  const noticeId = `${id}-aviso`;
  const showCounter = value.length >= Math.min(COUNTER_FROM, max);
  const empty = value.trim().length === 0;
  // Antes da hidratação (e sem JavaScript) o botão envia o formulário GET: nunca sai desabilitado.
  const inactive = hydrated && (disabled || empty);

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSend(q);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  return (
    <form
      id={formId}
      action="/pergunte"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cx("flex flex-col gap-1.5", className)}
    >
      <input type="hidden" name="modo" value={ASK.simpleMode} />
      <label htmlFor={id} className="sr-only">
        {ASK.chat.label}
      </label>
      <div className="flex items-end gap-2 rounded-xl border border-line-control bg-card-white p-1.5 pl-3">
        <textarea
          ref={inputRef}
          id={id}
          name="q"
          rows={1}
          maxLength={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={ASK.chat.placeholder}
          autoComplete="off"
          enterKeyHint="send"
          aria-describedby={showCounter ? `${noticeId} ${counterId}` : noticeId}
          className="max-h-40 min-h-tap flex-1 resize-none rounded-sm bg-transparent py-2.5 type-body text-strong [field-sizing:content] placeholder:text-placeholder"
        />
        <button
          type="submit"
          aria-label={ASK.chat.send}
          aria-disabled={inactive || undefined}
          className={cx(
            "inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill",
            inactive
              ? "bg-section text-meta"
              : "bg-action-primary text-on-inverse hover:bg-action-primary-pressed",
          )}
        >
          <Icon name="arrow-up" size={20} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <p id={noticeId} className="flex items-center gap-1.5 type-meta text-meta">
          <Icon name="circle-alert" size={14} className="shrink-0 text-ai" />
          {ASK.disclaimer}
        </p>
        {showCounter && (
          <span id={counterId} className="shrink-0 type-meta text-meta tabular-nums">
            {ASK.chat.counter(value.length, max)}
          </span>
        )}
      </div>
    </form>
  );
}
