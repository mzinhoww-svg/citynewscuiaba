"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { NavItem } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { NavLink } from "../ui/NavLink";
import { LiveIndicator } from "./LiveIndicator";

/** Rolagem (px) a partir da qual o cabeçalho encolhe. */
const SCROLLED_AT = 16;
/** Rolagem (px) a partir da qual descer recolhe a fileira de editorias (item 62). */
const HIDE_AFTER = 48;
/** Descida mínima (px) para recolher: ignora o tremor do toque e do elástico. */
const JITTER = 4;
/**
 * Subida mínima (px) para a fileira voltar. Maior que o ajuste que o navegador faz quando o
 * cabeçalho encolhe (a ancoragem da rolagem devolve alguns pixels para cima), que não é a pessoa
 * subindo.
 */
const REVEAL = 32;

/** A fileira de editorias está recolhida? (dado pelo `StickyHeader`, lido pela `SectionsNav`) */
const SectionsHidden = createContext(false);

/**
 * `<header>` fixo do portal com `data-scrolled`: liga quando a página rolou além de
 * `SCROLLED_AT`. A altura do bloco no fluxo não muda (o CSS compensa com margem inferior), então
 * o conteúdo não pula.
 *
 * Também recolhe a fileira de editorias ao descer além de `HIDE_AFTER` e a devolve ao subir
 * (P-05), e publica a altura do cabeçalho em `--cn-header-h` no `<html>` (ResizeObserver): é
 * dela que saem o `scroll-padding-top` e o topo das colunas fixas (`top-sticky-public`).
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
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > SCROLLED_AT);
      if (y <= HIDE_AFTER) {
        setHidden(false);
        last = y;
        return;
      }
      // `last` acompanha o ponto mais baixo enquanto desce e o mais alto enquanto sobe.
      if (y > last) {
        if (y - last > JITTER) setHidden(true);
        last = y;
      } else if (last - y > REVEAL) {
        setHidden(false);
        last = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--cn-header-h", `${el.offsetHeight}px`);
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--cn-header-h");
    };
  }, []);
  return (
    <header
      ref={ref}
      data-sticky="public"
      data-scrolled={scrolled ? "true" : "false"}
      className={className}
      style={style}
    >
      <SectionsHidden.Provider value={hidden}>{children}</SectionsHidden.Provider>
    </header>
  );
}

/** "● AGORA" do cabeçalho: leva ao bloco Agora da home e só pulsa na própria home (P-13). */
export function HeaderLive({ label, className }: { label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <LiveIndicator label={label} href="/#agora" pulse={pathname === "/"} className={className} />
  );
}

type Fade = "none" | "start" | "end" | "both";

const current = (active: string | undefined, id: string) =>
  active === undefined ? undefined : active === id;

/**
 * Fileira de editorias: rolável no celular, com `data-fade` indicando qual borda ainda tem
 * conteúdo (a máscara CSS vem de `scroll-fade`), e a editoria ativa centralizada ao carregar
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

  const hidden = useContext(SectionsHidden);

  // A fileira mantém o lugar no fluxo (o conteúdo não pula); recolhida, ela sobe por `transform`
  // e o invólucro a recorta, deixando ver a página. Com movimento reduzido, só alterna. Um link
  // focado por teclado traz a fileira de volta (`focus-within`).
  return (
    <div className="overflow-hidden">
      <nav
        aria-label={label}
        data-hidden={hidden ? "true" : "false"}
        className={cx(
          "pointer-events-auto border-b border-line-subtle bg-page",
          "motion-safe:transition-transform motion-safe:duration-(--dur-base) motion-safe:ease-(--ease-standard)",
          "data-[hidden=true]:-translate-y-full data-[hidden=true]:focus-within:translate-y-0",
        )}
      >
        <ul
          ref={listRef}
          data-fade={fade}
          className="mx-auto flex max-w-page snap-x gap-1 overflow-x-auto px-gutter scrollbar-none scroll-fade lg:justify-center"
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
    </div>
  );
}
