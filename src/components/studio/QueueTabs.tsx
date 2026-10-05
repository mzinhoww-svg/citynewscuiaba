import Link from "next/link";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";

export interface QueueTabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export interface QueueTabsProps {
  label: string;
  items: QueueTabItem[];
  current: string;
  className?: string;
}

/**
 * Abas da fila como links (o estado fica na URL, `?aba=`): Tudo, Fila de exceção, Publicadas
 * automaticamente em 24 h, Minha fila, Temas sensíveis. A atual leva `aria-current="page"`.
 */
export function QueueTabs({ label, items, current, className }: QueueTabsProps) {
  return (
    <nav aria-label={label} className={cx("border-b border-line-subtle", className)}>
      {/* `relative`: o `ul` rola na horizontal e é o bloco de contenção de qualquer descendente
          absoluto. Sem isso, os antigos `sr-only` das contagens escapavam da rolagem, alargavam a
          página e o celular afastava o zoom (a tela inteira ficava com 800 px de largura). */}
      <ul className="relative -mb-px flex gap-1 overflow-x-auto">
        {items.map((it) => {
          const active = it.key === current;
          return (
            <li key={it.key} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                // Nome com a contagem por extenso ("Fila de exceção, 3 itens"). Em `aria-label`,
                // não num span `sr-only`: o Chromium separaria com espaço ("Fila de exceção , 3").
                aria-label={
                  it.count !== undefined
                    ? `${it.label}${STUDIO_TEXT.tabCount(it.count)}`
                    : undefined
                }
                className={cx(
                  "flex min-h-tap items-center gap-2 border-b-2 px-3 text-14 no-underline",
                  active
                    ? "border-line-strong font-semibold text-strong"
                    : "border-transparent font-medium text-meta hover:text-strong",
                )}
              >
                {it.label}
                {it.count !== undefined && (
                  <span
                    aria-hidden="true"
                    className="rounded-pill bg-section px-2 py-0.5 text-13 tabular-nums text-strong"
                  >
                    {it.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
