"use client";

import { useId, useState, type ReactNode } from "react";
import { FIELD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import {
  CONTROL_CLASS,
  describedBy,
  FieldShell,
  NativeSelect,
  type OptionGroupLike,
  type OptionLike,
} from "./fields";

export type SuggestionValue = string | number | readonly string[] | null;

export interface FieldSuggestion {
  value: SuggestionValue;
  /** "ia" = agente `source_profiler`; "regra" = regra fixa (domínio, cadência, título do site). */
  origin: "ia" | "regra";
  /** Confiança do modelo (0–1), só para a IA. */
  confidence?: number;
}

export interface SuggestionFieldProps {
  name: string;
  label: string;
  id?: string;
  suggestion?: FieldSuggestion | null;
  /** Valor inicial (não controlado). */
  defaultValue?: string;
  /** Valor controlado; com ele, `onChange` é obrigatório. */
  value?: string;
  onChange?: (value: string) => void;
  /** Chamado quando a pessoa clica em "Usar sugestão" (registra `accepted_fields`). */
  onUse?: (value: string) => void;
  /** Com opções, o campo é uma lista (`select`); sem, texto. */
  options?: readonly OptionLike[];
  /** Grupos de opções (`optgroup`), depois de `options`. */
  groups?: readonly OptionGroupLike[];
  /** Texto legível do valor sugerido (ex.: rótulo da opção). */
  formatSuggestion?: (value: string) => string;
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  inputMode?: "text" | "numeric" | "url";
  className?: string;
}

/** Valor sugerido no formato do campo: listas viram "a, b"; `null` vira vazio. */
export function suggestionText(value: SuggestionValue): string {
  if (value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Campo com sugestão (spec §7.1.5 e §7.1.6): selo "Sugestão da IA" ou "Sugestão automática", o
 * valor sugerido em texto e o botão "Usar sugestão". Nada entra no campo sem esse clique.
 *
 * ```tsx
 * <SuggestionField name="categories" label="Editorias"
 *   suggestion={{ value: ["cidade"], origin: "ia", confidence: 0.8 }} onUse={markAccepted} />
 * ```
 * - O botão tem nome acessível completo ("Usar sugestão da IA para Editorias") e some quando o
 *   campo já tem o valor sugerido.
 */
export function SuggestionField({
  name,
  label,
  id,
  suggestion,
  defaultValue = "",
  value,
  onChange,
  onUse,
  options,
  groups,
  formatSuggestion,
  hint,
  error,
  aside,
  inputMode,
  className,
}: SuggestionFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `campo-${name}-${autoId.replace(/:/g, "")}`;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };

  const suggested = suggestion ? suggestionText(suggestion.value) : "";
  const hasSuggestion = suggestion != null && suggested !== "";
  const alreadyUsed = hasSuggestion && suggested === current;
  const shown = formatSuggestion ? formatSuggestion(suggested) : suggested;

  const box = hasSuggestion ? (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed px-3 py-2",
        suggestion.origin === "ia" ? "border-ai bg-ia-soft" : "border-line-control bg-section",
      )}
    >
      <span
        className={cx(
          "inline-flex items-center gap-1 type-meta font-semibold",
          suggestion.origin === "ia" ? "text-ai" : "text-strong",
        )}
      >
        <Icon name={suggestion.origin === "ia" ? "sun" : "settings"} size={14} />
        {FIELD_TEXT.suggestion[suggestion.origin]}
      </span>
      <span className="min-w-0 type-meta text-strong">
        {FIELD_TEXT.suggestion.value(shown)}
        {suggestion.origin === "ia" && typeof suggestion.confidence === "number"
          ? ` · ${FIELD_TEXT.suggestion.confidence(Math.round(suggestion.confidence * 100))}`
          : null}
      </span>
      {alreadyUsed ? (
        <span className="ml-auto inline-flex items-center gap-1 type-meta text-service">
          <Icon name="check" size={14} />
          {FIELD_TEXT.suggestion.applied}
        </span>
      ) : (
        <button
          type="button"
          aria-label={FIELD_TEXT.suggestion.use(suggestion.origin, label)}
          onClick={() => {
            set(suggested);
            onUse?.(suggested);
          }}
          className="hit-area ml-auto inline-flex h-button-sm cursor-pointer items-center rounded-pill border border-line-strong bg-card-white px-3 type-meta font-semibold text-strong hover:bg-section"
        >
          {FIELD_TEXT.suggestion.button}
        </button>
      )}
    </div>
  ) : null;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      aside={aside}
      className={className}
    >
      {options || groups ? (
        <NativeSelect
          id={fieldId}
          name={name}
          value={current}
          onChange={set}
          options={options}
          groups={groups}
          hint={hint}
          error={error}
        />
      ) : (
        <input
          id={fieldId}
          name={name}
          value={current}
          inputMode={inputMode}
          onChange={(e) => set(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={cx(CONTROL_CLASS, error && "field-error")}
        />
      )}
      {box}
    </FieldShell>
  );
}
