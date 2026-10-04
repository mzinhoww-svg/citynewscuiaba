"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CONSENT_TEXT } from "@/content/pt-BR/privacy";
import { LOAD_FAILED } from "@/content/pt-BR/system-min";
import { useInviteSlot } from "@/lib/app/slot";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import type { ConsentChoice } from "@/lib/consent";
import { Button } from "../ui/Button";

import type { ConsentPanelProps } from "./ConsentPanel";

/** Sem rede o painel não chega: avisa e deixa voltar (o banner continua funcionando). */
function PanelUnavailable({ onBack }: ConsentPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-3 px-gutter py-4 lg:px-4">
      <p role="alert" className="type-meta text-meta">
        {LOAD_FAILED.text}
      </p>
      <div className="flex justify-end">
        <Button variant="outline" size="md" onClick={onBack}>
          {CONSENT_TEXT.back}
        </Button>
      </div>
    </div>
  );
}

// O painel "Escolher" só carrega quando o leitor pede (B-018).
const ConsentPanel = lazy(() =>
  import("./ConsentPanel").catch(() => ({ default: PanelUnavailable })),
);

/** Leva o foco ao conteúdo depois da escolha (o banner some e o foco não pode cair no body). */
function focusContent() {
  const main = document.getElementById("conteudo");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

/**
 * Altura do banner em `--cn-consent-h` e `data-consent-open` no `<html>`: a página ganha
 * espaço no fim e `scroll-padding-bottom`, então o banner nunca esconde o fim do conteúdo
 * nem o item focado (WCAG 2.4.11).
 */
function useReserveSpace(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!open || !el) return;
    const apply = () => root.style.setProperty("--cn-consent-h", `${el.offsetHeight}px`);
    apply();
    root.setAttribute("data-consent-open", "");
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.removeAttribute("data-consent-open");
      root.style.removeProperty("--cn-consent-h");
    };
  }, [ref, open]);
}

/**
 * Banner de consentimento da primeira visita (spec §5.2, P22): região fixa no rodapé, acima da
 * barra inferior no celular e barra de uma linha no desktop. Legível ao sol (UX-W1-T5): texto
 * inteiro em 14 px, "Saiba mais" com alvo de 44 px e botões em 14 px; no celular o aceite ocupa
 * a segunda linha de ações (até 180 px de altura, medido em tests/e2e/consent.spec.ts).
 * A página ganha respiro inferior enquanto ele está aberto. Não bloqueia a leitura (não é modal e não
 * prende o foco).
 * Sem resposta vale "Só o necessário". "Escolher" abre as categorias no próprio banner.
 *
 * ```tsx
 * <ConsentProvider initial={consent}><ConsentBanner /></ConsentProvider>
 * ```
 */
export function ConsentBanner() {
  const [consent, update] = useConsent();
  const known = useConsentKnown();
  const [choosing, setChoosing] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>({ metrics: false, personalization: false });
  const regionRef = useRef<HTMLElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const open = known && !consent.decided;
  // Um convite por vez (spec 2026-09-28 §7.1): o banner vem na frente de todos.
  useInviteSlot("consent", open);
  useReserveSpace(regionRef, open);

  useEffect(() => {
    if (!choosing && restoreFocus.current) {
      restoreFocus.current = false;
      // Segundo botão das ações: "Escolher".
      actions.current?.querySelectorAll("button")[1]?.focus();
    }
  }, [choosing]);

  if (!open) return null;

  const decideAndClose = (choice: ConsentChoice) => {
    const hadFocus = regionRef.current?.contains(document.activeElement) ?? false;
    update(choice, "banner");
    if (hadFocus) focusContent();
  };

  const back = () => {
    restoreFocus.current = true;
    setChoosing(false);
  };

  return (
    <section
      ref={regionRef}
      aria-label={CONSENT_TEXT.region}
      className="fixed inset-x-0 bottom-tabbar-safe z-sheet border-t border-line-strong bg-card-white lg:bottom-0"
    >
      {choosing ? (
        <Suspense fallback={null}>
          <ConsentPanel draft={draft} onChange={setDraft} onBack={back} onSave={decideAndClose} />
        </Suspense>
      ) : (
        <div className="mx-auto flex w-full max-w-page flex-col gap-1.5 px-gutter py-2 lg:flex-row lg:items-center lg:gap-4">
          {/* O título segue na árvore (a região já leva o mesmo nome); a barra fica numa linha. */}
          <h2 className="sr-only">{CONSENT_TEXT.title}</h2>
          {/* 14 px e sem corte: o texto inteiro cabe em três linhas no celular de 360 px. */}
          <p className="min-w-0 text-14 leading-snug text-body lg:flex-1">{CONSENT_TEXT.body}</p>
          <div
            ref={actions}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 lg:flex lg:shrink-0 lg:gap-2"
          >
            <Link
              href="/privacidade"
              aria-label={CONSENT_TEXT.learnMore}
              className="flex min-h-tap items-center pr-1 text-14 font-semibold text-link underline underline-offset-4"
            >
              {CONSENT_TEXT.learnMoreShort}
            </Link>
            <Button
              variant="outline"
              size="md"
              className="px-3! text-14! leading-tight lg:px-4!"
              onClick={() => decideAndClose({ metrics: false, personalization: false })}
            >
              {CONSENT_TEXT.necessaryOnly}
            </Button>
            <Button
              variant="outline"
              size="md"
              className="px-3! text-14! leading-tight lg:px-4!"
              onClick={() => {
                setDraft({ metrics: false, personalization: false });
                setChoosing(true);
              }}
            >
              {CONSENT_TEXT.choose}
            </Button>
            <Button
              size="md"
              className="col-span-full px-3! text-14! leading-tight lg:px-4!"
              onClick={() => decideAndClose({ metrics: true, personalization: true })}
            >
              {CONSENT_TEXT.acceptAll}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
