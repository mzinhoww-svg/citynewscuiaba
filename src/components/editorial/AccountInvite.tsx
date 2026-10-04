"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ACCOUNT_INVITE_TEXT as T, ACCOUNT_TEXT } from "@/content/pt-BR/account";
import { hasAuthCookie } from "@/lib/auth/cookie";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** `localStorage`: quando o leitor tocou em "Agora não" (ISO). Vale por 30 dias. */
const KEY = "cn_account_invite";
const DAYS_MS = 30 * 86_400_000;

function dismissedRecently(now: number): boolean {
  try {
    const at = Date.parse(window.localStorage.getItem(KEY) ?? "");
    return Number.isFinite(at) && now - at < DAYS_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(now: number) {
  try {
    window.localStorage.setItem(KEY, new Date(now).toISOString());
  } catch {
    /* Armazenamento bloqueado: o convite volta na próxima visita, sem prejuízo. */
  }
}

/** Leitura do navegador sem assinatura: o valor é relido a cada renderização. */
const noSubscribe = () => () => {};
/** Já entrou ou recusou há pouco: o convite não aparece. No servidor, aparece. */
const hiddenHere = () => hasAuthCookie(document.cookie) || dismissedRecently(Date.now());
const hiddenOnServer = () => false;

export interface AccountInviteProps {
  /** Página para onde o leitor volta depois de entrar ou criar a conta. */
  next: string;
  /** Rótulo do botão principal (padrão "Criar conta"). */
  createLabel?: string;
  className?: string;
}

/**
 * Convite de conta nas telas de Perfil, Favoritos e Alertas (UI-T14): diz por que criar conta
 * (os 3 benefícios do login), lembra que é opcional e sempre oferece "Agora não", que recolhe o
 * convite por 30 dias neste navegador e deixa só uma linha discreta. Some para quem já entrou.
 * Nunca bloqueia nada (CLAUDE.md §5 regra 2).
 *
 * ```tsx
 * <AccountInvite next="/favoritos" />
 * ```
 */
export function AccountInvite({ next, createLabel = T.create, className }: AccountInviteProps) {
  const [dismissed, setDismissed] = useState(false);
  const hidden = useSyncExternalStore(noSubscribe, hiddenHere, hiddenOnServer);
  const status = useRef<HTMLParagraphElement>(null);
  const titleId = useId();
  const q = `?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (dismissed) status.current?.focus();
  }, [dismissed]);

  // Depois de "Agora não", a linha discreta vale até sair da página (o foco vai para ela).
  if (dismissed) {
    return (
      <p
        ref={status}
        role="status"
        tabIndex={-1}
        className={cx("type-meta text-meta outline-none", className)}
      >
        {T.dismissed}{" "}
        <Link
          href={`/criar-conta${q}`}
          className="inline-flex min-h-tap items-center font-semibold text-link underline underline-offset-4 hover:text-strong"
        >
          {createLabel}
        </Link>
      </p>
    );
  }
  if (hidden) return null;

  return (
    <section
      aria-labelledby={titleId}
      className={cx("flex flex-col gap-4 border-t-2 border-line-strong pt-4", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="type-section text-strong">
          {T.title}
        </h2>
        <p className="type-meta text-meta">{T.intro}</p>
      </div>
      <ul aria-label={ACCOUNT_TEXT.benefitsLabel} className="flex flex-col gap-2">
        {ACCOUNT_TEXT.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2 type-body text-strong">
            <Icon name="check" size={20} className="mt-0.5 shrink-0 text-service" />
            {b}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="md" href={`/criar-conta${q}`}>
          {createLabel}
        </Button>
        <Button size="md" variant="outline" href={`/entrar${q}`}>
          {T.signIn}
        </Button>
        <Button
          size="md"
          variant="text"
          onClick={() => {
            rememberDismissal(Date.now());
            setDismissed(true);
          }}
        >
          {T.notNow}
        </Button>
      </div>
    </section>
  );
}
