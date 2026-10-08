import type { ChangeEvent, ReactNode } from "react";
import { cx } from "../cx";
import { describedBy, FieldShell } from "./Field";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: readonly SelectOption[];
}

/** `md` = campo de formulário (52 px); `sm` = compacto de tabela e filtro (44 px, alvo de toque). */
export type SelectSize = "sm" | "md";

export interface SelectControlProps {
  id: string;
  name: string;
  options?: readonly SelectOption[];
  /** Opções agrupadas em `optgroup`, depois de `options`. */
  groups?: readonly SelectOptionGroup[];
  defaultValue?: string;
  /** Controlado (formulários interativos); sem ele, o campo é livre (`defaultValue`). */
  value?: string;
  onChange?: (value: string) => void;
  /** Primeira opção sem valor ("Todos os bairros"). */
  placeholder?: string;
  /** Só para montar `aria-describedby`; quem renderiza dica e erro é a moldura. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Campo só de leitura (modo leitura do editor): não abre nem muda. */
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
}

export interface SelectProps extends Omit<SelectControlProps, "hint" | "error" | "className"> {
  /** Rótulo sempre visível. */
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Conteúdo extra à direita do rótulo (ex.: "opcional"). */
  labelAside?: ReactNode;
  className?: string;
}

function renderOptions(options: readonly SelectOption[]) {
  return options.map((o) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  ));
}

/**
 * Só o controle (sem rótulo): para quando o rótulo já existe fora (filtro de tabela) ou a moldura
 * é montada por quem chama. A borda fica no contêiner com `control-field`, como no `TextField`,
 * para o foco trocar a borda do mesmo jeito (item 27).
 */
export function SelectControl({
  id,
  name,
  options = [],
  groups,
  defaultValue,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  disabled = false,
  size = "md",
  className,
}: SelectControlProps) {
  return (
    <div
      className={cx(
        "border-control control-field relative w-full rounded-lg bg-input",
        "transition-[border-color,box-shadow] duration-(--dur-base) ease-(--ease-standard)",
        size === "sm" ? "h-tap" : "h-input",
        "has-[:disabled]:bg-section",
        error && "field-error",
        className,
      )}
    >
      <select
        id={id}
        name={name}
        {...(value !== undefined
          ? { value, onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) }
          : {
              defaultValue: defaultValue ?? "",
              onChange: onChange
                ? (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)
                : undefined,
            })}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(
          // type-body nos dois tamanhos: abaixo de 16 px o iOS amplia a página ao focar.
          "size-full cursor-pointer appearance-none rounded-lg bg-transparent type-body text-strong",
          size === "sm" ? "pr-10 pl-3" : "pr-11 pl-4",
          "disabled:cursor-not-allowed",
        )}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {renderOptions(options)}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {renderOptions(g.options)}
          </optgroup>
        ))}
      </select>
      {!disabled && (
        <Icon
          name="chevron-down"
          size={size === "sm" ? 18 : 20}
          className={cx(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-meta",
            size === "sm" ? "right-3" : "right-4",
          )}
        />
      )}
    </div>
  );
}

/**
 * Lista de opções nativa com o visual de campo do kit (borda de controle R4, anel R5). Funciona
 * sem JavaScript dentro de formulários GET (filtros na URL). Com `error`, o `select` leva
 * `aria-invalid` e `aria-describedby` para a mensagem (item 26).
 *
 * ```tsx
 * <Select id="bairro" name="bairro" label="Bairro" placeholder="Todos os bairros" options={bairros} />
 * <Select id="tipo" name="tipo" label="Tipo" size="sm" groups={[{ label: "Coleta", options }]} />
 * ```
 */
export function Select({ label, hint, error, labelAside, className, ...control }: SelectProps) {
  return (
    <FieldShell
      id={control.id}
      label={label}
      hint={hint}
      error={error}
      required={control.required}
      aside={labelAside}
      className={className}
    >
      <SelectControl {...control} hint={hint} error={error} />
    </FieldShell>
  );
}
