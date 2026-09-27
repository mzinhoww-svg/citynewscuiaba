import type { LocalAlert } from "@/lib/anon/types";
import { ALERTS_TEXT } from "@/content/pt-BR/alerts";

/**
 * Alertas de navegador sem conta (P18), puro: o que notificar agora a partir das novidades do
 * portal. Limites: no máximo 3 avisos por dia e silêncio das 22h às 7h (Cuiabá); o que chega
 * no silêncio espera. Resumo diário e semanal viram um aviso com a contagem.
 */
export interface AlertItem {
  id: string;
  kind: "article" | "event";
  title: string;
  href: string;
  section: string;
  neighborhoods: string[];
  topicSlug: string | null;
  urgent: boolean;
  publishedAt: string;
}

export interface AlertNotification {
  title: string;
  body: string;
  href: string;
  /** Agrupa na central de notificações (um aviso por item ou por resumo). */
  tag: string;
}

export interface NotifyState {
  /** Ids de itens já avisados (ou contados num resumo), por alerta: `alerta:item`. */
  seen: string[];
  /** Momentos dos avisos enviados (para o limite diário). */
  sentAt: string[];
  /** Último resumo por alerta. */
  digestAt: Record<string, string>;
}

export const EMPTY_STATE: NotifyState = { seen: [], sentAt: [], digestAt: {} };
export const MAX_PER_DAY = 3;
const QUIET_FROM = 22;
const QUIET_TO = 7;
const DAY_MS = 86_400_000;
const MAX_SEEN = 500;

const hourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Cuiaba",
  hour: "2-digit",
  hourCycle: "h23",
});
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" });

export function isQuietHour(now: Date): boolean {
  const h = Number(hourFmt.format(now));
  return h >= QUIET_FROM || h < QUIET_TO;
}

function matches(a: LocalAlert, i: AlertItem): boolean {
  switch (a.kind) {
    case "bairro":
      return i.kind === "article" && i.neighborhoods.includes(a.target);
    case "tema":
      return i.kind === "article" && i.section === a.target;
    case "assunto":
      return i.kind === "article" && i.topicSlug === a.target;
    case "urgentes":
      return i.kind === "article" && i.urgent;
    case "agenda":
      return i.kind === "event";
  }
}

export function digestHref(a: LocalAlert): string {
  switch (a.kind) {
    case "bairro":
      return `/cidade?bairro=${encodeURIComponent(a.target)}`;
    case "tema":
      return `/${encodeURIComponent(a.target)}`;
    case "assunto":
      return `/assunto/${encodeURIComponent(a.target)}`;
    case "urgentes":
      return "/";
    case "agenda":
      return "/agenda";
  }
}

export function dueNotifications(
  alerts: LocalAlert[],
  items: AlertItem[],
  state: NotifyState,
  now: Date,
): { notifications: AlertNotification[]; state: NotifyState } {
  const today = dayFmt.format(now);
  const sentAt = state.sentAt.filter((t) => now.getTime() - Date.parse(t) < 2 * DAY_MS);
  let sentToday = sentAt.filter((t) => dayFmt.format(new Date(t)) === today).length;
  const seen = new Set(state.seen);
  const digestAt = { ...state.digestAt };
  const out: AlertNotification[] = [];
  const quiet = isQuietHour(now);

  for (const a of alerts) {
    if (a.channel !== "browser" || a.status !== "active") continue;
    const fresh = items
      .filter(
        (i) =>
          matches(a, i) &&
          Date.parse(i.publishedAt) >= Date.parse(a.at) &&
          !seen.has(`${a.id}:${i.id}`),
      )
      .sort((x, y) => Date.parse(x.publishedAt) - Date.parse(y.publishedAt));
    if (fresh.length === 0 || quiet) continue;

    if (a.frequency === "immediate") {
      for (const i of fresh) {
        if (sentToday >= MAX_PER_DAY) break;
        out.push({
          title: ALERTS_TEXT.notifyTitle(a.label),
          body: i.title,
          href: i.href,
          tag: `cn-${a.id}-${i.id}`,
        });
        seen.add(`${a.id}:${i.id}`);
        sentAt.push(now.toISOString());
        sentToday++;
      }
      continue;
    }
    const period = a.frequency === "daily" ? DAY_MS : 7 * DAY_MS;
    const last = digestAt[a.id] ? Date.parse(digestAt[a.id]!) : 0;
    if (now.getTime() - last < period || sentToday >= MAX_PER_DAY) continue;
    out.push({
      title: ALERTS_TEXT.digestTitle(fresh.length, a.label),
      body: fresh
        .slice(-3)
        .map((i) => i.title)
        .join(" · "),
      href: digestHref(a),
      tag: `cn-${a.id}-resumo`,
    });
    for (const i of fresh) seen.add(`${a.id}:${i.id}`);
    digestAt[a.id] = now.toISOString();
    sentAt.push(now.toISOString());
    sentToday++;
  }
  return {
    notifications: out,
    state: { seen: [...seen].slice(-MAX_SEEN), sentAt, digestAt },
  };
}
