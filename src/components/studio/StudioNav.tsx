"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { currentNavHref, NavLink } from "../ui/NavLink";
import { Icon } from "../ui/Icon";
import { filterStudioNav, navGroupKey } from "./nav-filter";
import type { StudioNavGroup, StudioNavItem } from "./StudioShell";

export interface StudioNavProps {
  nav: StudioNavGroup[];
  /**
   * Itens de onde sai o item atual. Na gaveta com busca, `nav` vem filtrada e o atual continua
   * sendo decidido sobre a navegação inteira. Padrão: `nav`.
   */
  allNav?: StudioNavGroup[];
  /** Campo "Buscar no menu" no topo (trilho do desktop); filtra com `filterStudioNav`. */
  search?: boolean;
  /** Abre todos os grupos, sem mudar o que a pessoa recolheu (a gaveta com busca ativa). */
  forceOpen?: boolean;
  /** Chamado ao escolher um item (a gaveta do celular fecha). */
  onNavigate?: () => void;
  /** Link "Ver o portal" no fim da lista (a gaveta mostra o seu no rodapé). */
  backLink?: boolean;
  className?: string;
}

/**
 * Navegação do Estúdio (trilho lateral no desktop e corpo da gaveta no celular). Decide o item
 * atual uma única vez: quando um item é prefixo de outro (`/estudio/control` e
 * `/estudio/control/fontes`), só o mais específico fica `aria-current="page"` (achado da revisão
 * FS-T7: os dois acendiam juntos).
 *
 * Item 50: grupos recolhíveis (`<details>`, lembrados em `localStorage` em `cn:nav:<grupo>`),
 * subgrupos com título, busca opcional e Contingência em destaque. Item 51: a contagem aparece em
 * texto ao lado do rótulo e entra no nome acessível ("Exceções, 3 pendentes").
 */
export function StudioNav({
  nav,
  allNav = nav,
  search = false,
  forceOpen = false,
  onNavigate,
  backLink = true,
  className,
}: StudioNavProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const winner = currentNavHref(
    pathname,
    allNav.flatMap((g) => g.items),
  );
  const shown = search ? filterStudioNav(nav, query) : nav;
  const searching = forceOpen || (search && query.trim() !== "");

  return (
    <nav aria-label={STUDIO_TEXT.nav} className={cx("bg-page px-3 py-4", className)}>
      {search && <StudioNavSearch value={query} onChange={setQuery} className="mb-3" />}
      {shown.length === 0 ? (
        <p role="status" className="px-3 py-2 type-body text-meta">
          {STUDIO_TEXT.menuEmpty(query.trim())}
        </p>
      ) : (
        shown.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            forceOpen={searching}
            winner={winner}
            onNavigate={onNavigate}
          />
        ))
      )}
      {backLink && (
        <Link
          href="/"
          className="mt-4 flex min-h-tap items-center gap-3 px-3 text-14 font-medium text-link underline-offset-4 hover:underline"
        >
          <Icon name="external-link" size={16} />
          {STUDIO_TEXT.backToSite}
        </Link>
      )}
    </nav>
  );
}

/** Campo de busca do menu (trilho do desktop e gaveta do celular). */
export function StudioNavSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {STUDIO_TEXT.menuSearch}
      </label>
      <div className="border-control control-field flex h-input items-center gap-3 rounded-lg bg-input px-4">
        <Icon name="search" className="text-placeholder" />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={STUDIO_TEXT.menuSearch}
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent type-body text-strong placeholder:text-placeholder [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grupos recolhíveis lembrados (localStorage pode faltar: modo privado, bloqueio, prévia)
// ---------------------------------------------------------------------------

const NAV_EVENT = "cn:nav";
const CLOSED = "closed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

function readClosed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === CLOSED;
  } catch {
    return false;
  }
}

function writeClosed(key: string, closed: boolean): void {
  try {
    if (closed) window.localStorage.setItem(key, CLOSED);
    else window.localStorage.removeItem(key);
  } catch {
    // Sem armazenamento, o grupo só não fica lembrado.
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

function NavGroup({
  group,
  forceOpen,
  winner,
  onNavigate,
}: {
  group: StudioNavGroup;
  forceOpen: boolean;
  winner: string | null;
  onNavigate?: () => void;
}) {
  const key = `cn:nav:${navGroupKey(group.label)}`;
  // No servidor e na hidratação o grupo nasce aberto; depois vale o que a pessoa recolheu.
  const closed = useSyncExternalStore(
    subscribe,
    () => readClosed(key),
    () => false,
  );
  const open = forceOpen || !closed;
  const baseId = useId();

  return (
    <details
      open={open}
      onToggle={(e) => {
        // A busca abre tudo sem mexer na preferência; só o clique da pessoa conta.
        if (forceOpen) return;
        const nowOpen = e.currentTarget.open;
        if (nowOpen === !closed) return;
        writeClosed(key, !nowOpen);
      }}
      className="group/nav mb-3 last:mb-0"
    >
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
        <span className="type-eyebrow text-meta">{group.label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className="shrink-0 text-meta group-open/nav:rotate-180 motion-safe:transition-transform"
        />
      </summary>
      {runs(group.items).map((run, i) =>
        run.subgroup ? (
          <div key={run.subgroup} role="group" aria-labelledby={`${baseId}-${i}`} className="mt-2">
            <p id={`${baseId}-${i}`} className="px-3 pb-1 type-meta font-semibold text-meta">
              {run.subgroup}
            </p>
            <ItemList items={run.items} winner={winner} onNavigate={onNavigate} />
          </div>
        ) : (
          <ItemList key={`_${i}`} items={run.items} winner={winner} onNavigate={onNavigate} />
        ),
      )}
    </details>
  );
}

/** Itens seguidos do mesmo subgrupo viram um bloco (a ordem de `items` manda). */
function runs(items: StudioNavItem[]): { subgroup?: string; items: StudioNavItem[] }[] {
  const out: { subgroup?: string; items: StudioNavItem[] }[] = [];
  for (const it of items) {
    const last = out.at(-1);
    if (last && last.subgroup === it.subgroup) last.items.push(it);
    else out.push({ subgroup: it.subgroup, items: [it] });
  }
  return out;
}

function ItemList({
  items,
  winner,
  onNavigate,
}: {
  items: StudioNavItem[];
  winner: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.href} data-emphasis={it.emphasis ? "true" : undefined}>
          <NavLink
            href={it.href}
            current={it.href === winner}
            onClick={onNavigate}
            className={cx(
              "flex min-h-tap items-center gap-3 rounded-sm px-3 text-16 text-strong no-underline hover:bg-hover",
              "aria-[current=page]:bg-section aria-[current=page]:font-semibold",
              it.emphasis && "font-semibold",
            )}
          >
            <Icon
              name={it.icon}
              size={20}
              className={cx("shrink-0", it.emphasis && "text-danger")}
            />
            <span className="min-w-0 flex-1">{it.label}</span>
            {it.count !== undefined && it.count > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-pill border border-line-subtle bg-page px-2 text-13 font-semibold tabular-nums text-strong"
                >
                  {it.count}
                </span>
                <span className="sr-only">{STUDIO_TEXT.navCount(it.count, it.countKind)}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
