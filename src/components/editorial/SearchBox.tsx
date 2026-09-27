"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SEARCH } from "@/content/pt-BR/search";
import { normalizeQuery } from "@/lib/search/query";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface SearchBoxProps {
  defaultValue?: string;
  /** Destino do formulário GET (padrão `/busca`). */
  action?: string;
  /** Filtros atuais preservados ao buscar de novo (nome → valor de URL). */
  hidden?: Record<string, string>;
  /** Endpoint das sugestões (`?q=`); vazio desliga o autocomplete. */
  suggestEndpoint?: string;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  className?: string;
}

const RECENT_KEY = "cn:buscas-recentes";
const RECENT_MAX = 8;
const DEBOUNCE_MS = 150;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((s): s is string => typeof s === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Armazenamento bloqueado: as buscas recentes ficam só nesta visita.
  }
}

/**
 * Campo da busca com autocomplete (P12): sugestões do acervo em `listbox` (setas, Enter, Esc)
 * e buscas recentes guardadas só neste navegador, removíveis uma a uma. É um formulário GET:
 * sem JavaScript, continua buscando.
 *
 * ```tsx
 * <SearchBox defaultValue={q} hidden={{ origem: "citynews" }} />
 * ```
 * - Padrão combobox do ARIA 1.2 (`aria-activedescendant`); rótulo sempre visível.
 * - As buscas recentes nunca saem do navegador.
 */
export function SearchBox({
  defaultValue = "",
  action = "/busca",
  hidden = {},
  suggestEndpoint = "/api/search/suggest",
  label = SEARCH.boxLabel,
  placeholder = SEARCH.placeholder,
  submitLabel = SEARCH.submit,
  className,
}: SearchBoxProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const recentId = `${id}-recentes`;
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const [fetched, setFetched] = useState<{ q: string; list: string[] }>({ q: "", list: [] });
  const [active, setActive] = useState(-1);
  // Só é lido depois do foco (nada disto aparece na primeira renderização): sem divergência
  // de hidratação.
  const [recent, setRecent] = useState<string[]>(readRecent);
  const query = normalizeQuery(value);
  const suggestions = fetched.q === query && query.length >= 2 ? fetched.list : [];

  useEffect(() => {
    const q = query;
    if (!suggestEndpoint || q.length < 2 || !focused) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${suggestEndpoint}?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const body: unknown = res.ok ? await res.json() : null;
        const list =
          body &&
          typeof body === "object" &&
          "suggestions" in body &&
          Array.isArray(body.suggestions)
            ? body.suggestions.filter((s: unknown): s is string => typeof s === "string")
            : [];
        setFetched({ q, list });
        setActive(-1);
      } catch {
        // Sem sugestões (rede ou cancelamento): o campo continua funcionando.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, focused, suggestEndpoint]);

  const showList = focused && suggestions.length > 0;
  const showRecent = focused && value.trim() === "" && recent.length > 0;

  const go = (q: string) => {
    const query = normalizeQuery(q);
    if (!query) return;
    writeRecent([query, ...readRecent().filter((r) => r !== query)]);
    const params = new URLSearchParams({ q: query, ...hidden });
    setFocused(false);
    router.push(`${action}?${params.toString()}`);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    go(active >= 0 && showList ? (suggestions[active] ?? value) : value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setFocused(false);
      setActive(-1);
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  };

  const removeRecent = (q: string) => {
    const next = recent.filter((r) => r !== q);
    writeRecent(next);
    setRecent(next);
  };

  return (
    <form role="search" action={action} onSubmit={onSubmit} className={className}>
      {Object.entries(hidden).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <div
        ref={rootRef}
        className="relative flex flex-col gap-2"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <label htmlFor={id} className="type-label text-strong">
          {label}
        </label>
        <div className="border-control control-field flex h-input items-center gap-3 rounded-lg bg-input pr-1 pl-4">
          <Icon name="search" className="shrink-0 text-placeholder" />
          <input
            id={id}
            type="search"
            name="q"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={200}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent type-body text-strong placeholder:text-placeholder"
          />
          <button
            type="submit"
            className="inline-flex min-h-tap shrink-0 cursor-pointer items-center rounded-pill bg-action-primary px-4 text-14 font-semibold text-on-inverse hover:bg-action-primary-pressed"
          >
            {submitLabel}
          </button>
        </div>
        <div
          className={cx(
            "absolute top-full right-0 left-0 z-dropdown mt-1 flex-col border border-line-control bg-card-white",
            showList || showRecent ? "flex" : "hidden",
          )}
        >
          <ul id={listId} role="listbox" aria-label={SEARCH.suggestions} hidden={!showList}>
            {suggestions.map((s, i) => (
              <li
                key={s}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(s);
                }}
                className={cx(
                  "flex min-h-tap cursor-pointer items-center gap-3 px-4 py-2 type-body text-strong",
                  i === active ? "bg-section" : "hover:bg-section",
                )}
              >
                <Icon name="search" size={16} className="shrink-0 text-meta" />
                <span className="line-clamp-2">{s}</span>
              </li>
            ))}
          </ul>
          {showRecent && (
            <section aria-labelledby={recentId} className="flex flex-col py-2">
              <h2 id={recentId} className="px-4 pb-1 type-eyebrow text-meta">
                {SEARCH.recent}
              </h2>
              <ul>
                {recent.map((r) => (
                  <li key={r} className="flex items-center gap-1 pr-1">
                    <a
                      href={`${action}?${new URLSearchParams({ q: r, ...hidden }).toString()}`}
                      className="flex min-h-tap min-w-0 flex-1 items-center gap-3 px-4 type-body text-strong no-underline hover:bg-section"
                    >
                      <Icon name="clock" size={16} className="shrink-0 text-meta" />
                      <span className="truncate">{r}</span>
                    </a>
                    <button
                      type="button"
                      aria-label={SEARCH.removeRecent(r)}
                      onClick={() => removeRecent(r)}
                      className="flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-section hover:text-strong"
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </form>
  );
}
