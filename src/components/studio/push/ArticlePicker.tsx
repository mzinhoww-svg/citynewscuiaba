"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NEW_PUSH_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { ArticleOption } from "@/lib/db/queries/push-admin";
import { formatWhen } from "@/lib/format/date";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { CONTROL_CLASS, FieldShell } from "../sources/fields";

export interface ArticlePickerProps {
  /** Busca no servidor (`searchArticlesAction` embrulhada): já filtrada pelo papel. */
  search: (q: string) => Promise<ArticleOption[]>;
  value: ArticleOption | null;
  onChange: (article: ArticleOption | null) => void;
  error?: string | null;
  className?: string;
}

const DEBOUNCE_MS = 250;

/**
 * Campo "Matéria" (spec §10.2): busca por título entre publicadas e não patrocinadas (editor só
 * da própria editoria, filtrado no servidor), lista com rótulo de origem e horário; a escolhida
 * vira um cartão com "Trocar matéria". Combobox nativo por ARIA, teclado completo.
 */
export function ArticlePicker({ search, value, onChange, error, className }: ArticlePickerProps) {
  const uid = useId().replace(/:/g, "");
  const inputId = `${uid}-materia`;
  const listId = `${uid}-lista`;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ArticleOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const found = await search(q);
        if (mine === seq.current) setItems(found);
      } catch {
        if (mine === seq.current) setItems([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, open, search]);

  const pick = (a: ArticleOption) => {
    onChange(a);
    setOpen(false);
    setQ("");
    setItems(null);
    setActive(-1);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!items || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className={cx("flex flex-col gap-2", className)}>
        <p className="type-label text-16 text-strong">{T.article}</p>
        <div
          aria-label={T.articleChosen}
          role="group"
          className="flex flex-col gap-2 rounded-lg border border-line-section bg-section p-4"
        >
          <p className="type-body font-semibold text-strong">{value.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-meta">
            <span className="rounded-xs bg-card-white px-1.5 py-0.5 text-12 font-semibold tracking-wide text-strong">
              {value.originLabel}
            </span>
            <span>{value.sectionName}</span>
            {value.publishedAt && <span>{T.publishedAt(formatWhen(value.publishedAt))}</span>}
          </p>
          <p className="type-meta text-meta">{T.articleUnpublished}</p>
          <div>
            <Button
              size="sm"
              variant="outline"
              icon="refresh-cw"
              onClick={() => {
                onChange(null);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              {T.articleChange}
            </Button>
          </div>
        </div>
        <input type="hidden" name="articleId" value={value.id} />
      </div>
    );
  }

  return (
    <FieldShell
      id={inputId}
      label={T.article}
      hint={T.articleHint}
      error={error}
      className={className}
    >
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[`${inputId}-dica`, error ? `${inputId}-erro` : null]
            .filter(Boolean)
            .join(" ")}
          className={cx(CONTROL_CLASS, error && "field-error")}
        />
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={T.articleResults}
        aria-busy={busy}
        hidden={!open}
        className="max-h-72 overflow-y-auto rounded-lg border border-line-section bg-card-white empty:hidden"
      >
        {items && items.length === 0 && !busy && (
          <li
            role="option"
            aria-selected={false}
            aria-disabled
            className="px-4 py-3 type-meta text-meta"
          >
            {T.articleNone}
          </li>
        )}
        {busy && items === null && (
          <li
            role="option"
            aria-selected={false}
            aria-disabled
            className="px-4 py-3 type-meta text-meta"
          >
            {T.articleSearching}
          </li>
        )}
        {(items ?? []).map((a, i) => (
          <li
            key={a.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(a)}
            className={cx(
              "flex cursor-pointer flex-col gap-0.5 border-b border-line-subtle px-4 py-3 last:border-b-0 hover:bg-section",
              i === active && "bg-section",
            )}
          >
            <span className="type-body text-strong">{a.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 type-meta text-meta">
              <span className="font-semibold tracking-wide">{a.originLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{a.sectionName}</span>
              {a.publishedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{T.publishedAt(formatWhen(a.publishedAt))}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </FieldShell>
  );
}
