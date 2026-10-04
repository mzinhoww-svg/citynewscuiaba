/** Central de notificações da equipe (BELL-T1). Tipos e constantes puros. */
export const SEVERITIES = ["urgent", "warn", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface StudioNotification {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  /** Sempre um caminho interno do Estúdio (`/estudio/...`). */
  href: string;
  objectRef: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationGroup {
  severity: Severity;
  items: StudioNotification[];
}

export interface NotificationsSnapshot {
  items: StudioNotification[];
  unread: number;
}

/** Linha como o banco devolve (`studio_notifications_for`). */
export interface NotificationRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  href: string;
  object_ref: string | null;
  created_at: string;
  read_at: string | null;
}
