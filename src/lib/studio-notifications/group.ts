import {
  SEVERITIES,
  type NotificationGroup,
  type NotificationRow,
  type Severity,
  type StudioNotification,
} from "./types";

export function isSeverity(v: string): v is Severity {
  return (SEVERITIES as readonly string[]).includes(v);
}

/** Caminho interno do Estúdio: nunca esquema, `//` nem caminho fora de `/estudio`. */
export function safeStudioHref(href: string): string {
  return /^\/estudio(\/[A-Za-z0-9\-._~%/?=&#]*)?$/.test(href) && !href.includes("//")
    ? href
    : "/estudio/notificacoes";
}

/** Converte a linha do banco; severidade desconhecida vira `info`. */
export function fromRow(r: NotificationRow): StudioNotification {
  return {
    id: r.id,
    kind: r.kind,
    severity: isSeverity(r.severity) ? r.severity : "info",
    title: r.title,
    body: r.body,
    href: safeStudioHref(r.href),
    objectRef: r.object_ref,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

/** Mais recente primeiro; desempate estável por id. */
export function sortNotifications(items: readonly StudioNotification[]): StudioNotification[] {
  return [...items].sort((a, b) => {
    const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Agrupa por severidade (urgentes, atenção, informativas), pulando grupos vazios. Dentro do
 * grupo as não lidas vêm antes; depois, a mais recente primeiro.
 */
export function groupBySeverity(items: readonly StudioNotification[]): NotificationGroup[] {
  const out: NotificationGroup[] = [];
  for (const severity of SEVERITIES) {
    const inGroup = sortNotifications(items.filter((n) => n.severity === severity));
    const ordered = [
      ...inGroup.filter((n) => n.readAt === null),
      ...inGroup.filter((n) => n.readAt !== null),
    ];
    if (ordered.length > 0) out.push({ severity, items: ordered });
  }
  return out;
}

/** Junta uma lista nova à anterior sem repetir id (a nova vence: traz o estado de leitura). */
export function mergeNotifications(
  prev: readonly StudioNotification[],
  next: readonly StudioNotification[],
): StudioNotification[] {
  const byId = new Map<string, StudioNotification>();
  for (const n of prev) byId.set(n.id, n);
  for (const n of next) byId.set(n.id, n);
  return sortNotifications([...byId.values()]);
}

export function countUnread(items: readonly StudioNotification[]): number {
  return items.reduce((n, it) => (it.readAt === null ? n + 1 : n), 0);
}

/** Marca como lidas (otimista) as ids dadas; as que já estavam lidas ficam como estavam. */
export function applyRead(
  items: readonly StudioNotification[],
  ids: ReadonlySet<string> | "all",
  at: string,
): StudioNotification[] {
  return items.map((n) =>
    n.readAt === null && (ids === "all" || ids.has(n.id)) ? { ...n, readAt: at } : n,
  );
}

/** Texto do contador no sino: 1 a 99, depois "99+"; vazio quando não há. */
export function badgeText(unread: number): string {
  if (unread <= 0) return "";
  return unread > 99 ? "99+" : String(unread);
}

/** Quantas não lidas são novas em relação ao que já se conhecia (anúncio educado). */
export function newSince(
  knownIds: ReadonlySet<string>,
  items: readonly StudioNotification[],
): number {
  return items.filter((n) => n.readAt === null && !knownIds.has(n.id)).length;
}
