"use client";

import Form from "next/form";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

const noopSubscribe = () => () => {};

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField {
  name: string;
  label: string;
  /** Valor atual, o da URL. */
  value: string;
  options: readonly FilterOption[];
  /** Primeira opção sem valor ("Todos os bairros"). */
  placeholder?: string;
}

export interface FilterBarProps {
  /** Rota GET que recebe os filtros (`/cidade`, `/busca`). */
  action: string;
  /** Nome do grupo para leitores de tela. */
  label: string;
  fields: readonly FilterField[];
  /** Campos que o formulário preserva sem mostrar (`q`, `sub`, `tipo`…); vazios são omitidos. */
  hidden?: Record<string, string | undefined>;
  /** Quantos filtros diferem do padrão; `Limpar` só aparece com pelo menos 1. */
  activeCount?: number;
  clearHref?: string;
  clearLabel: string;
  /** Rótulo do botão que só existe sem JavaScript. */
  applyLabel: string;
  /** Muda quando a URL muda: remonta os campos, que mostram sempre o valor da URL. */
  formKey?: string;
  className?: string;
}

/**
 * Barra única de filtros com estado na URL (spec 2026-10-02 §4.6): cada campo é uma lista nativa
 * com rótulo visível e **aplica ao mudar**, sem botão. É um formulário GET (`next/form`), então o
 * Voltar do navegador restaura os filtros; sem JavaScript, um botão "Aplicar" dentro de
 * `noscript` mantém tudo funcionando. No celular a barra rola na horizontal dentro dela mesma,
 * sem rolagem da página; no desktop os campos quebram em linhas.
 *
 * ```tsx
 * <FilterBar action="/cidade" label="Filtros" fields={fields} activeCount={1} clearHref="/cidade" clearLabel="Limpar filtros" applyLabel="Aplicar filtros" />
 * ```
 */
export function FilterBar({
  action,
  label,
  fields,
  hidden = {},
  activeCount = 0,
  clearHref,
  clearLabel,
  applyLabel,
  formKey,
  className,
}: FilterBarProps) {
  // Sinal de hidratação: antes dele, uma mudança de campo não envia o formulário.
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <Form
      key={formKey}
      action={action}
      autoComplete="off"
      aria-label={label}
      data-filter-bar=""
      data-ready={ready}
      className={cx(
        "-mx-gutter -my-1.5 flex items-end gap-3 overflow-x-auto px-gutter py-1.5 scrollbar-none lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0",
        className,
      )}
    >
      {Object.entries(hidden).map(([name, v]) =>
        v ? <input key={name} type="hidden" name={name} value={v} /> : null,
      )}
      {fields.map((f) => {
        const id = `filtro-${action.replace(/\W+/g, "")}-${f.name}`;
        return (
          <div key={f.name} className="flex shrink-0 flex-col gap-1">
            <label htmlFor={id} className="type-meta text-meta">
              {f.label}
            </label>
            <div className="relative">
              <select
                id={id}
                name={f.name}
                defaultValue={f.value}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="border-control h-tap min-w-36 cursor-pointer appearance-none rounded-pill bg-input pr-10 pl-4 text-14 font-semibold text-strong"
              >
                {f.placeholder !== undefined && <option value="">{f.placeholder}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={16}
                className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
              />
            </div>
          </div>
        );
      })}
      <noscript>
        <button
          type="submit"
          className="h-tap shrink-0 rounded-pill bg-action-primary px-5 text-14 font-semibold text-on-inverse"
        >
          {applyLabel}
        </button>
      </noscript>
      {activeCount > 0 && clearHref && (
        <Link
          href={clearHref}
          className="inline-flex min-h-tap shrink-0 items-center text-14 font-semibold whitespace-nowrap text-link underline underline-offset-4 hover:text-strong"
        >
          {clearLabel}
        </Link>
      )}
    </Form>
  );
}
