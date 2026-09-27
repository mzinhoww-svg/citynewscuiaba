import { allowsSending, type Consent } from "@/lib/consent";
import {
  ALGO_VERSION,
  PERSONAL_PROPS,
  type Device,
  type EventName,
  type EventPayload,
  type EventProps,
} from "./names";

/**
 * Envio de eventos pelo navegador (tracking-plan §1, regra de envio):
 * - sem escolha, ou só o necessário: nada sai do navegador;
 * - só métricas: sem `anonId`, sem id de sessão, sem referência e sem props pessoais;
 * - personalização: completo, com `anonId`.
 * Sem zod aqui (bundle do cliente): quem valida é o servidor (`./schema`).
 */
export interface TrackContext {
  consent: Consent;
  anonId: string | null;
  page: string;
  referrer?: string | null;
  device: Device;
  /** Id da aba (sessionStorage), só usado com Personalização. */
  sessionId?: string;
  sourceId?: string | null;
  contentId?: string | null;
  now?: Date;
}

const METRICS_SESSION = "-";

function pathOnly(page: string): string {
  const path = page.split(/[?#]/)[0] ?? "/";
  return path.startsWith("/") ? path.slice(0, 300) : "/";
}

function originOnly(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Monta o evento conforme o consentimento, ou `null` quando nada pode ser enviado. */
export function buildEvent<N extends EventName>(
  name: N,
  props: EventProps[N],
  ctx: TrackContext,
): EventPayload | null {
  const { consent } = ctx;
  if (!allowsSending(consent)) return null;
  const personal = consent.personalization && ctx.anonId !== null;
  const cleanProps: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props as Record<string, string | number | boolean>)) {
    if (v === undefined) continue;
    if (!personal && PERSONAL_PROPS.includes(k)) continue;
    cleanProps[k] = v;
  }
  return {
    name,
    anonId: personal ? ctx.anonId : null,
    userId: null,
    at: (ctx.now ?? new Date()).toISOString(),
    sourceId: ctx.sourceId ?? null,
    contentId: ctx.contentId ?? null,
    session: {
      id: personal ? (ctx.sessionId ?? METRICS_SESSION).slice(0, 64) : METRICS_SESSION,
      page: pathOnly(ctx.page),
      referrer: personal ? originOnly(ctx.referrer) : null,
      device: ctx.device,
    },
    consent: {
      version: consent.version,
      metrics: consent.metrics,
      personalization: consent.personalization,
    },
    algoVersion: ALGO_VERSION,
    props: cleanProps,
  };
}

export const EVENTS_ENDPOINT = "/api/events";

/** Envia sem bloquear a página; qualquer falha (rede, servidor sem banco) é ignorada. */
export function sendEvent(event: EventPayload): void {
  try {
    const body = JSON.stringify(event);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(EVENTS_ENDPOINT, body)) return;
    }
    if (typeof fetch === "function") {
      void fetch(EVENTS_ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => undefined);
    }
  } catch {
    // Sem rede, sem beacon ou bloqueado: métricas nunca quebram a leitura.
  }
}

export function deviceFromWidth(width: number): Device {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

const SESSION_KEY = "cn_session";

/** Id aleatório por aba (some ao fechar). Só usado com Personalização. */
export function tabSessionId(): string {
  try {
    const cur = sessionStorage.getItem(SESSION_KEY);
    if (cur) return cur;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return METRICS_SESSION;
  }
}

/**
 * `track(name, props, ctx)` no navegador: respeita o consentimento, completa página,
 * referência e dispositivo e envia por `sendBeacon`. Devolve se algo foi enviado.
 */
export function track<N extends EventName>(
  name: N,
  props: EventProps[N],
  ctx: Pick<TrackContext, "consent" | "anonId" | "sourceId" | "contentId">,
): boolean {
  if (typeof window === "undefined") return false;
  const event = buildEvent(name, props, {
    ...ctx,
    page: location.pathname,
    referrer: document.referrer || null,
    device: deviceFromWidth(window.innerWidth),
    sessionId: ctx.consent.personalization ? tabSessionId() : undefined,
  });
  if (!event) return false;
  sendEvent(event);
  return true;
}
