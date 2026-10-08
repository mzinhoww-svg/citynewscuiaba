"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { NAV_TEXT } from "@/content/pt-BR/nav";

/** Estado final da espera: sem troca de rota até aqui, a barra some sozinha. */
const GIVE_UP_MS = 12_000;

/** Endereço de destino de um clique ou envio, se ele leva a outra página do próprio portal. */
function internalTarget(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Mesma página (inclusive só a âncora): nada a carregar.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return url.pathname + url.search;
}

function fromClick(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.hasAttribute("download")) return null;
  if (a.target && a.target !== "_self") return null;
  return internalTarget(a.href);
}

function fromSubmit(e: SubmitEvent): string | null {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return null;
  if (form.method.toLowerCase() !== "get") return null;
  if (form.target && form.target !== "_self") return null;
  const query = new URLSearchParams();
  for (const [k, v] of new FormData(form, e.submitter)) {
    if (typeof v === "string") query.append(k, v);
  }
  const qs = query.toString();
  return internalTarget(`${form.action}${qs ? `?${qs}` : ""}`);
}

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  // Pendente enquanto a rota for a mesma do clique. Trocou a rota (clique, voltar, avançar),
  // a espera acaba: o ajuste é feito na própria renderização, sem efeito extra.
  const [from, setFrom] = useState<string | null>(null);
  const [seen, setSeen] = useState(here);
  if (seen !== here) {
    setSeen(here);
    setFrom(null);
  }
  const current = useRef(here);
  useEffect(() => {
    current.current = here;
  }, [here]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = (target: string | null) => {
      if (!target) return;
      setFrom(current.current);
      clearTimeout(timer);
      timer = setTimeout(() => setFrom(null), GIVE_UP_MS);
    };
    // Captura: roda antes do `<Link>`, que cancela o padrão do clique para navegar no cliente.
    const onClick = (e: MouseEvent) => start(fromClick(e));
    const onSubmit = (e: SubmitEvent) => start(fromSubmit(e));
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer);
    };
  }, []);

  if (from !== here) return null;
  return (
    <div
      role="progressbar"
      aria-label={NAV_TEXT.navigating}
      className="pointer-events-none fixed inset-x-0 top-0 z-dropdown h-0.75 origin-left bg-accent motion-safe:animate-nav-progress"
    />
  );
}

/**
 * Indicador de navegação pendente (item 87): linha fina no topo do cabeçalho do portal entre o
 * clique num link interno (ou o envio de um formulário GET) e a chegada da nova rota. É um
 * `progressbar` indeterminado e sem `aria-live`; com movimento reduzido, fica parado.
 */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
