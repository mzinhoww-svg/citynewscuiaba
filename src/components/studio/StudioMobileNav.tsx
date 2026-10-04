"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Drawer } from "../ui/Drawer";
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
 * do conteúdo. Usa `Drawer` (`<dialog>` modal): foco preso, Esc e toque fora fecham, a página
 * atrás não rola e o foco volta ao botão Menu. Escolher uma tela fecha a gaveta.
 */
export function StudioMobileNav({ nav, user, className }: StudioMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seenPath, setSeenPath] = useState(pathname);
  const searchId = useId();

  // Mudou de rota (inclusive pelo voltar do navegador): a gaveta não fica aberta por cima.
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
    setQuery("");
  }

  // A gaveta devolve o foco ao botão Menu ao fechar (Esc, scrim, Fechar ou escolher uma tela).
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const shown = filterStudioNav(nav, query);

  return (
    <div className={cx("flex", className)}>
      <button
        type="button"
        aria-label={STUDIO_TEXT.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex size-tap cursor-pointer items-center justify-center rounded-pill text-strong transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-section active:bg-section"
      >
        <Icon name="menu" size={24} />
      </button>
      <Drawer
        open={open}
        onClose={close}
        title={STUDIO_TEXT.menuTitle}
        hideTitle
        closeLabel={STUDIO_TEXT.closeMenu}
        scrollBody={false}
        header={
          <p className="flex flex-col type-meta text-meta">
            <span className="sr-only">{STUDIO_TEXT.signedInAs}</span>
            <span className="truncate text-16 font-semibold text-strong">{user.name}</span>
            <span>{user.role}</span>
          </p>
        }
        footer={
          <Link
            href="/"
            onClick={close}
            className="-my-2 flex min-h-tap items-center gap-3 px-2 text-14 font-medium text-link underline-offset-4 hover:underline"
          >
            <Icon name="external-link" size={16} />
            {STUDIO_TEXT.backToSite}
          </Link>
        }
      >
        <div className="px-4 py-3">
          <label htmlFor={searchId} className="sr-only">
            {STUDIO_TEXT.menuSearch}
          </label>
          <div className="border-control control-field flex h-input items-center gap-3 rounded-lg bg-input px-4">
            <Icon name="search" className="text-placeholder" />
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
              onNavigate={close}
              className="pt-0"
            />
          ) : (
            <p role="status" className="px-6 py-4 type-body text-meta">
              {STUDIO_TEXT.menuEmpty(query.trim())}
            </p>
          )}
        </div>
      </Drawer>
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
  return <p className={cx("truncate type-nav-title text-strong", className)}>{label}</p>;
}
