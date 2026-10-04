"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { NavItem } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { NavLink } from "../ui/NavLink";

/** Rolagem (px) a partir da qual o cabeçalho encolhe. */
const SCROLLED_AT = 16;

/**
 * `<header>` fixo do portal com `data-scrolled`: liga quando a página rolou além de
 * `SCROLLED_AT`. A altura do bloco no fluxo não muda (o CSS compensa com margem inferior), então
 * o conteúdo não pula.
 */
export function StickyHeader({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLLED_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      data-sticky="public"
      data-scrolled={scrolled ? "true" : "false"}
      className={className}
      style={style}
    >
      {children}
    </header>
  );
}

type Fade = "none" | "start" | "end" | "both";

const current = (active: string | undefined, id: string) =>
  active === undefined ? undefined : active === id;

/**
 * Fileira de editorias: rolável no celular, com `data-fade` indicando qual borda ainda tem
 * conteúdo (o véu CSS vem de `scroll-fade`, no `<nav>`), e a editoria ativa centralizada ao carregar
 * (e ao trocar de rota), sem animação sob `prefers-reduced-motion`.
 */
export function SectionsNav({
  sections,
  active,
  label,
}: {
  sections: readonly NavItem[];
  active?: string;
  label: string;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState<Fade>("none");

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setFade(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const target = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!target || typeof target.scrollIntoView !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [pathname, active]);

  return (
    <nav aria-label={label} data-fade={fade} className="scroll-fade border-t border-line-subtle">
      <ul
        ref={listRef}
        className="mx-auto flex max-w-page snap-x scroll-px-gutter gap-1 overflow-x-auto px-gutter scrollbar-none lg:justify-center"
      >
        {sections.map((it) => (
          <li key={it.id} className="snap-start">
            <NavLink
              href={it.href}
              current={current(active, it.id)}
              className={cx(
                "flex min-h-tap items-center whitespace-nowrap px-3 text-14 font-medium text-meta no-underline",
                "hover:text-strong aria-[current=page]:font-semibold aria-[current=page]:text-strong",
                "aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8",
              )}
            >
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
