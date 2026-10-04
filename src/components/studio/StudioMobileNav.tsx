"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { currentNavHref } from "../ui/NavLink";
import { filterStudioNav } from "./nav-filter";
import { StudioNav } from "./StudioNav";
import type { StudioNavGroup, StudioUser } from "./StudioShell";

export interface StudioMobileNavProps {
  nav: StudioNavGroup[];
  user: StudioUser;
  className?: string;
}

/**
 * Menu do Estúdio no celular e no tablet (abaixo de `lg`): botão no cabeçalho que abre uma gaveta
 * lateral com a conta, a busca no menu e a navegação. Substitui a lista inteira empilhada antes
 * do conteúdo. `<dialog>` nativo modal: foco preso, Esc e toque fora fecham, a página atrás não
 * rola. Escolher uma tela fecha a gaveta.
 */
export function StudioMobileNav({ nav, user, className }: StudioMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seenPath, setSeenPath] = useState(pathname);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const searchId = useId();

  // Mudou de rota (inclusive pelo voltar do navegador): a gaveta não fica aberta por cima.
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!open || !el) return;
    if (!el.open) el.showModal?.();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  };

  const shown = filterStudioNav(nav, query);

  return (
    <div className={cx("flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={STUDIO_TEXT.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex size-tap cursor-pointer items-center justify-center rounded-pill text-strong transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-section active:bg-section"
      >
        <Icon name="menu" size={24} />
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onClose={() => close(true)}
          onClick={(e) => {
            if (e.target === e.currentTarget) close(true);
          }}
          className={cx(
            "m-0 h-dvh max-h-none w-[min(24rem,88vw)] max-w-none bg-page p-0 text-strong shadow-dialog",
            "backdrop:bg-overlay backdrop:backdrop-blur-scrim open:motion-safe:animate-drawer-in",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start gap-3 border-b border-line-subtle py-3 pr-2 pl-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0 flex-1 py-1">
                <h2 id={titleId} className="sr-only">
                  {STUDIO_TEXT.menuTitle}
                </h2>
                <p className="flex flex-col type-meta text-meta">
                  <span className="sr-only">{STUDIO_TEXT.signedInAs}</span>
                  <span className="truncate text-16 font-semibold text-strong">{user.name}</span>
                  <span>{user.role}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label={STUDIO_TEXT.closeMenu}
                onClick={() => close(true)}
                className="inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-section active:bg-section"
              >
                <Icon name="x" size={22} />
              </button>
            </div>
            <div className="px-4 py-3">
              <label htmlFor={searchId} className="sr-only">
                {STUDIO_TEXT.menuSearch}
              </label>
              <div className="border-control control-field flex h-input items-center gap-3 rounded-lg bg-input px-4">
                <Icon name="search" color="var(--text-placeholder)" />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={STUDIO_TEXT.menuSearch}
                  autoComplete="off"
                  enterKeyHint="search"
                  className="min-w-0 flex-1 bg-transparent type-body text-strong placeholder:text-placeholder [&::-webkit-search-cancel-button]:appearance-none"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {shown.length > 0 ? (
                <StudioNav
                  nav={shown}
                  allNav={nav}
                  backLink={false}
                  onNavigate={() => close(false)}
                  className="pt-0"
                />
              ) : (
                <p role="status" className="px-6 py-4 type-body text-meta">
                  {STUDIO_TEXT.menuEmpty(query.trim())}
                </p>
              )}
            </div>
            <div className="border-t border-line-subtle px-3 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
              <Link
                href="/"
                onClick={() => close(false)}
                className="flex min-h-tap items-center gap-3 px-3 text-14 font-medium text-link underline-offset-4 hover:underline"
              >
                <Icon name="external-link" size={16} />
                {STUDIO_TEXT.backToSite}
              </Link>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

/** Nome da tela atual no cabeçalho do celular (o item de menu mais específico que casa com a rota). */
export function StudioPageTitle({ nav, className }: { nav: StudioNavGroup[]; className?: string }) {
  const pathname = usePathname();
  const items = nav.flatMap((g) => g.items);
  const href = currentNavHref(pathname, items);
  const label = items.find((it) => it.href === href)?.label;
  if (!label) return null;
  // `span`: o `text-wrap: pretty` global de `<p>` venceria o `truncate` (uma linha só).
  return (
    <span className={cx("block truncate type-nav-title text-strong", className)}>{label}</span>
  );
}
