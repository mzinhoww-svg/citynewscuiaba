"use client";

import { useEffect, useRef, useState } from "react";

/** Leitura dos campos do formulário como estão no DOM (o que a pessoa já digitou ou marcou). */
export interface FormFields {
  /** Texto de um campo (input, select ou textarea) pelo `name`; `null` se não existir. */
  text: (name: string) => string | null;
  /** Estado de uma caixa de seleção pelo `name`; `null` se não existir. */
  checked: (name: string) => boolean | null;
}

function fields(form: HTMLFormElement): FormFields {
  const el = (name: string) => form.elements.namedItem(name);
  return {
    text: (name) => {
      const e = el(name);
      return e instanceof HTMLInputElement ||
        e instanceof HTMLSelectElement ||
        e instanceof HTMLTextAreaElement
        ? e.value
        : null;
    },
    checked: (name) => {
      const e = el(name);
      return e instanceof HTMLInputElement ? e.checked : null;
    },
  };
}

/**
 * Formulário com campos controlados que não perde o que foi digitado antes da hidratação.
 *
 * No celular lento a pessoa (ou o teste) digita antes de o JavaScript carregar. O React hidrata
 * mantendo o valor do DOM, mas o estado continua o inicial ("") e não dispara `onChange`; na
 * primeira renderização seguinte (digitar em outro campo, enviar) o React devolve o valor do
 * estado ao campo e apaga o texto. Ao montar, `adopt` recebe os campos como estão no DOM para
 * copiar para o estado. `ready` vira `true` depois disso (use em `data-ready`).
 */
export function useHydratedForm(adopt: (fields: FormFields) => void) {
  const ref = useRef<HTMLFormElement>(null);
  const adoptRef = useRef(adopt);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ref.current) adoptRef.current(fields(ref.current));
    // Sincroniza com o DOM (sistema externo) uma única vez, na montagem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);
  return { ref, ready };
}
