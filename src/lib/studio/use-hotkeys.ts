"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** Uma linha da ajuda: as teclas (alternativas, ex.: `["Ctrl+S", "⌘+S"]`) e o que fazem. */
export interface HotkeyHelpEntry {
  keys: readonly string[];
  label: string;
}

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export interface UseHotkeysOptions {
  /** Desligado = nenhum atalho nem linha de ajuda. Padrão: ligado. */
  enabled?: boolean;
  /** Linhas que a ajuda (`?`) mostra enquanto o componente está montado e ligado. */
  help?: readonly HotkeyHelpEntry[];
}

const TEXT_INPUTS = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Campo onde a tecla é texto: input de texto, textarea, select e `[contenteditable]`. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUTS.has(target.type || "text");
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  // jsdom não calcula isContentEditable: confere o atributo no próprio elemento e nos ancestrais.
  const ce = target.closest("[contenteditable]");
  return ce !== null && ce.getAttribute("contenteditable") !== "false";
}

/**
 * Nome canônico da combinação: a tecla como o navegador a entrega (`j`, `/`, `?`, `J`) ou
 * `mod+<tecla>` com Ctrl ou ⌘. Alt e Ctrl/⌘ com Shift não viram atalho (ficam com o sistema).
 */
export function comboOf(e: KeyboardEvent): string | null {
  if (!e.key || e.altKey) return null;
  if (e.ctrlKey || e.metaKey) return e.shiftKey ? null : `mod+${e.key.toLowerCase()}`;
  return e.key;
}

// Registro das linhas da ajuda das telas montadas (a ajuda lista só os atalhos da tela).
let groups: { id: number; entries: readonly HotkeyHelpEntry[] }[] = [];
let snapshot: readonly HotkeyHelpEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish() {
  snapshot = groups.flatMap((g) => g.entries);
  for (const l of listeners) l();
}

function registerHelp(entries: readonly HotkeyHelpEntry[]): () => void {
  const id = nextId++;
  groups = [...groups, { id, entries }];
  publish();
  return () => {
    groups = groups.filter((g) => g.id !== id);
    publish();
  };
}

/** Linhas da ajuda registradas agora (na ordem de montagem). */
export function helpEntries(): readonly HotkeyHelpEntry[] {
  return snapshot;
}

function subscribeHelp(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const EMPTY: readonly HotkeyHelpEntry[] = [];

/** As linhas da ajuda, reativas (para o diálogo do `?`). */
export function useHotkeyHelp(): readonly HotkeyHelpEntry[] {
  return useSyncExternalStore(subscribeHelp, helpEntries, () => EMPTY);
}

/**
 * Atalhos de teclado do Estúdio (item 53). `map` liga a combinação (`j`, `?`, `mod+s`) ao
 * que ela faz; a combinação casada tem o padrão do navegador impedido.
 *
 * - Atalho de tecla única nunca dispara com o foco em campo editável (input de texto,
 *   textarea, select, `[contenteditable]`) nem com um diálogo modal aberto.
 * - Combinação com Ctrl/⌘ (`mod+s`) dispara também dentro do campo.
 * - Teclas sem atalho (Tab, Enter, setas) seguem intocadas.
 *
 * ```tsx
 * useHotkeys({ j: next, k: prev }, { help: [{ keys: ["j"], label: "Próxima" }] });
 * ```
 */
export function useHotkeys(map: HotkeyMap, opts: UseHotkeysOptions = {}): void {
  const enabled = opts.enabled ?? true;
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const combo = comboOf(e);
      if (!combo) return;
      const fn = mapRef.current[combo];
      if (!fn) return;
      if (!combo.startsWith("mod+")) {
        if (isEditable(e.target)) return;
        if (document.querySelector("dialog[open]")) return;
      }
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const help = opts.help;
  const helpKey = help ? JSON.stringify(help) : "";
  useEffect(() => {
    if (!enabled || !helpKey) return;
    return registerHelp(JSON.parse(helpKey) as HotkeyHelpEntry[]);
  }, [enabled, helpKey]);
}
