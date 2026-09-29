"use client";

import { useId, useState, type ReactNode } from "react";
import { FIELDS } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface FieldSuggestion {
  value: string | number | string[] | null;
  /** `ia`: só entra no campo com clique. `regra`: sugestão automática, já preenchida. */
  origin: "ia" | "regra";
  confidence?: number;
  /** Campo crítico: a sugestão nunca vem preenchida e o selo avisa que exige segunda aprovação. */
  needsApproval?: boolean;
}

export interface SuggestionFieldProps {
  name: string;
  label: string;
  id?: string;
  kind?: "text" | "number" | "select";
  options?: readonly { value: string; label: string }[];
  /** Valor inicial quando a sugestão não vem preenchida. */
  defaultValue?: string;
  suggestion?: FieldSuggestion | null;
  hint?: ReactNode;
  error?: string | undefined;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "url";
  readOnly?: boolean;
  /** Campo que amplia direitos: o selo "Exige segunda aprovação" aparece ao lado do rótulo. */
  critical?: boolean;
  maxLength?: number;
  onValueChange?: (value: string) => void;
  className?: string;
}

const textOf = (v: FieldSuggestion["value"]): string =>
  v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);

/**
 * Campo com sugestão (spec §7.1). A sugestão da IA aparece com o selo "Sugestão da IA" e o botão
 * "Usar sugestão": nada entra no campo sem o clique. A sugestão por regra ("Sugestão automática")
 * já vem preenchida, editável, com botão para restaurar. Enquanto o valor é o sugerido, o campo
 * envia `acceptedFields=<name>` (registro de `source_discoveries.accepted_fields`). O selo e o
 * botão são texto; a cor só reforça.
 */
export function SuggestionField({
  name,
  label,
  id,
  kind = "text",
  options,
  defaultValue = "",
  suggestion,
  hint,
  error,
  placeholder,
  inputMode,
  readOnly = false,
  critical = false,
  maxLength,
  onValueChange,
  className,
}: SuggestionFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const suggested = suggestion ? textOf(suggestion.value) : null;
  const prefilled =
    suggestion?.origin === "regra" && !suggestion.needsApproval && suggested !== null;
  const [value, setValue] = useState(prefilled ? (suggested ?? "") : defaultValue);
  const set = (v: string) => {
    setValue(v);
    onValueChange?.(v);
  };
  const hasSuggestion = suggestion != null && suggested !== null && suggested !== "";
  const applied = hasSuggestion && value === suggested;
  const hintId = hint ? `${fieldId}-dica` : undefined;
  const errorId = error ? `${fieldId}-erro` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const isIa = suggestion?.origin === "ia";
  const use = isIa ? FIELDS.applyIa(label) : FIELDS.applyRule(label);

  const control =
    kind === "select" ? (
      <div className="relative">
        <select
          id={fieldId}
          name={name}
          value={value}
          disabled={readOnly}
          onChange={(e) => set(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "border-control h-input w-full cursor-pointer appearance-none rounded-lg bg-input pr-11 pl-4 type-body text-strong disabled:cursor-not-allowed disabled:opacity-60",
            error && "field-error",
          )}
        >
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size={20}
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
        />
      </div>
    ) : (
      <input
        id={fieldId}
        name={name}
        type={kind === "number" ? "number" : "text"}
        inputMode={inputMode ?? (kind === "number" ? "numeric" : undefined)}
        value={value}
        readOnly={readOnly}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "border-control control-field h-input w-full rounded-lg bg-input px-4 type-body text-strong placeholder:text-placeholder read-only:bg-section",
          error && "field-error",
        )}
      />
    );

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={fieldId} className="type-label text-16 text-strong">
          {label}
        </label>
        {critical && !suggestion?.needsApproval && (
          <span className="inline-flex items-center gap-1 type-meta font-semibold text-warn">
            <Icon name="lock" size={14} />
            {FIELDS.critical}
          </span>
        )}
        {suggestion && (
          <span className="inline-flex flex-wrap items-center gap-x-2 type-meta text-meta">
            <span className="inline-flex items-center gap-1 rounded-pill border border-line-section bg-section px-2 py-0.5 font-semibold text-strong">
              <Icon name={isIa ? "sliders-horizontal" : "check"} size={14} />
              {isIa ? FIELDS.suggestionIa : FIELDS.suggestionRule}
            </span>
            {isIa && suggestion.confidence !== undefined && (
              <span>{FIELDS.confidence(Math.round(suggestion.confidence * 100))}</span>
            )}
            {suggestion.needsApproval && (
              <span className="font-semibold text-warn">{FIELDS.needsApproval}</span>
            )}
          </span>
        )}
      </div>
      {control}
      {hasSuggestion && !applied && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 type-meta text-meta">
          <span>
            Sugerido:{" "}
            <strong className="font-semibold text-strong">
              {kind === "select"
                ? (options?.find((o) => o.value === suggested)?.label ?? suggested)
                : suggested}
            </strong>
          </span>
          <button
            type="button"
            aria-label={use}
            onClick={() => set(suggested ?? "")}
            className="inline-flex min-h-tap cursor-pointer items-center gap-1 rounded-pill border border-line-control bg-card-white px-4 font-semibold text-strong hover:bg-section"
          >
            <Icon name="check" size={16} />
            Usar sugestão
          </button>
        </div>
      )}
      {applied && !readOnly && isIa && (
        <p className="inline-flex items-center gap-1 type-meta text-service">
          <Icon name="check" size={16} />
          {FIELDS.applied}
        </p>
      )}
      {applied && <input type="hidden" name="acceptedFields" value={name} />}
      {hint && (
        <p id={hintId} className="type-meta text-meta">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 type-meta text-danger">
          <Icon name="circle-alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}
