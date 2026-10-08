"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";

export interface ToastInput {
  message: string;
  tone?: "success" | "error" | "info";
  /** Ação opcional ("Desfazer"): chama `onClick` e fecha o aviso. */
  action?: { label: string; onClick: () => void };
  /** Tempo até sumir sozinho; padrão 6 s. Pausa com o ponteiro ou o foco no aviso. */
  durationMs?: number;
}

export interface ToastApi {
  show(t: ToastInput): void;
}

interface ToastItem extends ToastInput {
  id: number;
}

const DEFAULT_DURATION_MS = 6000;
/** Mais que isso empilha demais na tela do celular: sai o mais antigo. */
const MAX_VISIBLE = 3;

const TONE: Record<NonNullable<ToastInput["tone"]>, { icon: IconName; ink: string }> = {
  info: { icon: "info", ink: "text-meta" },
  success: { icon: "check", ink: "text-service" },
  error: { icon: "circle-alert", ink: "text-danger" },
};

const ToastContext = createContext<ToastApi | null>(null);
/* Fora do provider (teste isolado, tela fora das cascas) o aviso é ignorado em vez de quebrar. */
const NOOP: ToastApi = { show: () => {} };

/** Mostra avisos curtos depois de uma ação ("Fonte removida", "Desfazer"). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

/**
 * Provider dos toasts (item 36). A região viva (`aria-live="polite"`, com `role="status"` enquanto
 * há aviso) fica sempre montada (o leitor de tela só anuncia mudanças numa região que já
 * existia), fixa acima da barra inferior do portal e da
 * área segura, na camada `z-toast`. Fechar um aviso com o foco dentro dele devolve o foco a quem
 * estava focado antes (ou ao conteúdo principal): o foco nunca cai no `body`.
 *
 * ```tsx
 * const { show } = useToast();
 * show({ message: "Fonte removida", action: { label: "Desfazer", onClick: restore } });
 * ```
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const regionRef = useRef<HTMLDivElement>(null);
  /** Último elemento focado fora da região: destino do foco quando um aviso fecha. */
  const lastFocusOutside = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && !regionRef.current?.contains(target)) {
        lastFocusOutside.current = target;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { ...t, id }].slice(-MAX_VISIBLE));
  }, []);

  const dismiss = useCallback((id: number) => {
    const node = regionRef.current?.querySelector(`[data-toast="${id}"]`);
    if (node && node.contains(document.activeElement)) restoreFocus(lastFocusOutside.current);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={regionRef}
        data-toast-region=""
        /* A região viva é o `aria-live`, sempre montado. O papel `status` só entra com aviso na
           tela para não duplicar o `status` de cada página (consultas por papel nos testes). */
        role={toasts.length > 0 ? "status" : undefined}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-toast-safe z-toast flex flex-col items-center gap-2 px-gutter"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function restoreFocus(previous: HTMLElement | null) {
  if (previous && previous.isConnected && previous !== document.body) {
    previous.focus();
    if (document.activeElement === previous) return;
  }
  const main = document.getElementById("conteudo") ?? document.querySelector("main");
  if (main instanceof HTMLElement) {
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
  }
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { id, message, tone = "info", action, durationMs = DEFAULT_DURATION_MS } = toast;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(durationMs);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, id, onDismiss]);

  const t = TONE[tone];
  return (
    <div
      data-toast={id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={cx(
        "pointer-events-auto flex w-full max-w-read items-center gap-3 rounded-xl border",
        "border-line-section bg-card-white py-1 pr-1 pl-4 shadow-dialog motion-safe:animate-fade-in",
      )}
    >
      <Icon name={t.icon} size={20} className={cx("shrink-0", t.ink)} />
      <p className="min-w-0 flex-1 py-2 type-body text-strong">{message}</p>
      {action && (
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            action.onClick();
            onDismiss(id);
          }}
        >
          {action.label}
        </Button>
      )}
      <IconButton
        icon="x"
        variant="ghost"
        size={44}
        label={UI.closeToast}
        onClick={() => onDismiss(id)}
      />
    </div>
  );
}
