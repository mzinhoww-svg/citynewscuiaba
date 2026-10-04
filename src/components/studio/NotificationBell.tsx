"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BELL_TEXT, SEVERITY_BADGE, SEVERITY_TEXT } from "@/content/pt-BR/studio-notifications";
import { formatDateTime, formatWhen } from "@/lib/format/date";
import {
  applyRead,
  badgeText,
  countUnread,
  groupBySeverity,
  newSince,
  type NotificationsSnapshot,
  type Severity,
} from "@/lib/studio-notifications";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface NotificationBellProps {
  /** Intervalo de atualização (ms); 30 s por padrão. Em aba oculta não busca. */
  pollMs?: number;
  /** Destino do atalho "Ver push"; ausente para quem não tem nenhuma ação de push. */
  pushHref?: string | null;
  /** Endpoints (injetáveis nos testes). */
  endpoint?: string;
  className?: string;
}

type Status = "loading" | "ready" | "error";

const SEVERITY_STYLE: Record<Severity, string> = {
  urgent: "bg-erro-soft text-danger",
  warn: "bg-atencao-soft text-warn",
  info: "bg-section text-meta",
};

const EMPTY: NotificationsSnapshot = { items: [], unread: 0 };

function isSnapshot(v: unknown): v is NotificationsSnapshot {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { items?: unknown }).items) &&
    typeof (v as { unread?: unknown }).unread === "number"
  );
}

/**
 * Sino da central de notificações da equipe (cabeçalho do Estúdio, todas as páginas). Contador
 * de não lidas, painel em popover agrupado por severidade, marcar uma ou todas como lidas,
 * filtro "só não lidas". Atualiza por polling leve (30 s; pausa em aba oculta e atualiza ao
 * voltar). Atalho: Alt + N abre e fecha. Novas notificações são anunciadas em `aria-live="polite"`.
 * Esc e clique fora fecham e devolvem o foco ao botão.
 *
 * ```tsx
 * <NotificationBell pushHref="/estudio/admin/notificacoes" />
 * ```
 */
export function NotificationBell({
  pollMs = 30_000,
  pushHref = null,
  endpoint = "/api/estudio/notificacoes",
  className,
}: NotificationBellProps) {
  const [snap, setSnap] = useState<NotificationsSnapshot>(EMPTY);
  const [status, setStatus] = useState<Status>("loading");
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Relógio do "há 12 min": anda a cada busca e ao abrir o painel.
  const [now, setNow] = useState(() => new Date());
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data: unknown = await res.json();
      if (!isSnapshot(data)) throw new Error("formato");
      if (mine !== seq.current) return;
      setSnap({ items: data.items, unread: data.unread });
      setNow(new Date());
      setStatus("ready");
      setStale(false);
      if (known.current === null) known.current = new Set(data.items.map((n) => n.id));
      else {
        const fresh = newSince(known.current, data.items);
        for (const n of data.items) known.current.add(n.id);
        if (fresh > 0) setAnnounce(BELL_TEXT.announceNew(fresh));
      }
    } catch {
      if (mine !== seq.current) return;
      // Já havia lista: mantém a última e avisa; senão, estado de erro com "Tentar de novo".
      setStale(true);
      setStatus((s) => (s === "ready" ? "ready" : "error"));
    }
  }, [endpoint]);

  useEffect(() => {
    // Primeira busca fora do corpo do efeito (a atualização de estado vem depois da resposta).
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, pollMs]);

  // Atalho Alt + N (ignora digitação em campos).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyN")) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t as HTMLInputElement).readOnly)
        return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const post = useCallback(
    async (payload: { ids: string[] } | { all: true }) => {
      const before = snap;
      const at = new Date().toISOString();
      const next = applyRead(snap.items, "all" in payload ? "all" : new Set(payload.ids), at);
      setSnap({ items: next, unread: countUnread(next) });
      try {
        const res = await fetch(`${endpoint}/ler`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(String(res.status));
        void refresh();
      } catch {
        setSnap(before);
        setStale(true);
      }
    },
    [snap, endpoint, refresh],
  );

  const visibleItems = useMemo(
    () => (onlyUnread ? snap.items.filter((n) => n.readAt === null) : snap.items),
    [snap.items, onlyUnread],
  );
  const groups = useMemo(() => groupBySeverity(visibleItems), [visibleItems]);
  const badge = badgeText(snap.unread);

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={BELL_TEXT.button(snap.unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-keyshortcuts="Alt+N"
        title={BELL_TEXT.shortcutHint}
        onClick={() => {
          setNow(new Date());
          setOpen((o) => !o);
        }}
        className="relative inline-flex size-tap cursor-pointer items-center justify-center rounded-pill border border-transparent text-strong transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-section"
      >
        <Icon name="bell" size={22} />
        {badge && (
          <span
            aria-hidden="true"
            data-testid="bell-count"
            className="absolute top-1 right-0 inline-flex min-w-5 items-center justify-center plate-edge rounded-pill border bg-tinta px-1 type-meta font-semibold text-branco ring-2 ring-page"
          >
            {badge}
          </span>
        )}
      </button>
      <p className="sr-only" data-testid="bell-live" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={BELL_TEXT.region}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            }
          }}
          className="fixed inset-x-4 top-16 z-dropdown flex max-h-[min(36rem,80dvh)] flex-col rounded-md border border-line-control bg-card-white shadow-dialog sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[26rem]"
        >
          <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2">
            <h2 className="type-nav-title text-strong">{BELL_TEXT.panelTitle}</h2>
            <button
              type="button"
              aria-label={BELL_TEXT.close}
              onClick={() => close(true)}
              className="ml-auto inline-flex size-tap cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-section"
            >
              <Icon name="x" size={20} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-1">
            <label className="flex min-h-tap cursor-pointer items-center gap-2 type-body text-body">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
                className="size-4"
              />
              {BELL_TEXT.onlyUnread}
            </label>
            <button
              type="button"
              disabled={snap.unread === 0}
              onClick={() => void post({ all: true })}
              className="ml-auto min-h-tap cursor-pointer text-14 font-semibold text-link underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-meta disabled:no-underline"
            >
              {BELL_TEXT.markAll}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {stale && status === "ready" && (
              <p className="px-4 py-2 type-meta text-warn">{BELL_TEXT.stale}</p>
            )}
            {status === "loading" && (
              <p aria-live="polite" className="px-4 py-6 type-body text-meta">
                {BELL_TEXT.loading}
              </p>
            )}
            {status === "error" && (
              <div role="alert" className="flex flex-col items-start gap-2 px-4 py-6">
                <p className="font-semibold text-strong">{BELL_TEXT.errorTitle}</p>
                <p className="type-body text-meta">{BELL_TEXT.errorBody}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("loading");
                    void refresh();
                  }}
                  className="min-h-tap cursor-pointer text-14 font-semibold text-link underline-offset-4 hover:underline"
                >
                  {BELL_TEXT.retry}
                </button>
              </div>
            )}
            {status === "ready" && groups.length === 0 && (
              <div className="px-4 py-6">
                <p className="font-semibold text-strong">
                  {onlyUnread ? BELL_TEXT.emptyUnreadTitle : BELL_TEXT.emptyTitle}
                </p>
                <p className="type-body text-meta">
                  {onlyUnread ? BELL_TEXT.emptyUnreadBody : BELL_TEXT.emptyBody}
                </p>
              </div>
            )}
            {status === "ready" &&
              groups.map((g) => (
                <section key={g.severity} aria-label={SEVERITY_TEXT[g.severity]}>
                  <h3 className="px-4 pt-3 pb-1 type-eyebrow text-meta">
                    {SEVERITY_TEXT[g.severity]}
                  </h3>
                  <ul>
                    {g.items.map((n) => (
                      <li
                        key={n.id}
                        data-read={n.readAt !== null}
                        className="flex items-start gap-2 border-b border-line-subtle px-4 py-2 last:border-b-0"
                      >
                        <Link
                          href={n.href}
                          onClick={() => {
                            if (n.readAt === null) void post({ ids: [n.id] });
                            setOpen(false);
                          }}
                          className="flex min-w-0 flex-1 flex-col gap-1 rounded-xs no-underline"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cx(
                                "rounded-xs px-1.5 type-meta font-semibold",
                                SEVERITY_STYLE[n.severity],
                              )}
                            >
                              {SEVERITY_BADGE[n.severity]}
                            </span>
                            {n.readAt === null && (
                              <span className="type-meta font-semibold text-strong">
                                {BELL_TEXT.unread}
                              </span>
                            )}
                            <time
                              dateTime={n.createdAt}
                              title={formatDateTime(n.createdAt)}
                              className="ml-auto type-meta whitespace-nowrap text-meta"
                            >
                              {formatWhen(n.createdAt, now)}
                            </time>
                          </span>
                          <span
                            className={cx(
                              "text-16 text-strong",
                              n.readAt === null && "font-semibold",
                            )}
                          >
                            {n.title}
                          </span>
                          {n.body && <span className="type-body text-meta">{n.body}</span>}
                        </Link>
                        {n.readAt === null && (
                          <button
                            type="button"
                            aria-label={BELL_TEXT.markOne(n.title)}
                            title={BELL_TEXT.markOne(n.title)}
                            onClick={() => void post({ ids: [n.id] })}
                            className="inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-section"
                          >
                            <Icon name="check" size={20} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 border-t border-line-subtle px-4 py-1">
            <Link
              href="/estudio/notificacoes"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline-offset-4 hover:underline"
            >
              {BELL_TEXT.seeAll}
            </Link>
            {pushHref && (
              <Link
                href={pushHref}
                onClick={() => setOpen(false)}
                className="ml-auto inline-flex min-h-tap items-center text-14 font-semibold text-link underline-offset-4 hover:underline"
              >
                {BELL_TEXT.seePush}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
