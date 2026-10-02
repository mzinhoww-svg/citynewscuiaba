import type { ChangeEvent, CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "./Icon";

export interface SearchBarProps {
  placeholder?: string;
  /** Nome acessível do campo (fica visualmente oculto). */
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onFilter?: () => void;
  showFilter?: boolean;
  /** Destino do formulário (GET com `q`). */
  action?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Campo de busca no topo das telas de feed; o ícone de controles à direita abre os filtros.
 *
 * ```tsx
 * <SearchBar placeholder="Buscar notícias ou autores" onFilter={openFilters} />
 * ```
 * - É um `<form role="search">` que envia `q` para `/busca`, então funciona sem JavaScript.
 */
export function SearchBar({
  placeholder = UI.searchPlaceholder,
  label = UI.search,
  value,
  defaultValue,
  onChange,
  onFilter,
  showFilter = true,
  action = "/busca",
  name = "q",
  className,
  style,
}: SearchBarProps) {
  return (
    <form role="search" action={action} className={className} style={style}>
      <div className="border-control control-field flex h-input items-center gap-3 rounded-lg bg-input pr-1 pl-4">
        <Icon name="search" color="var(--text-placeholder)" />
        <label className="flex h-full min-w-0 flex-1 items-center">
          <span className="sr-only">{label}</span>
          <input
            type="search"
            name={name}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent type-body text-strong placeholder:text-placeholder"
          />
        </label>
        {showFilter && (
          <button
            type="button"
            aria-label={UI.filters}
            onClick={onFilter}
            className={cx(
              "flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:text-strong",
            )}
          >
            <Icon name="sliders-horizontal" />
          </button>
        )}
      </div>
    </form>
  );
}
