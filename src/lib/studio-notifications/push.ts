/**
 * Push de urgências da central para a equipe (BELL-T1). Reaproveita o `PushSender` do push do
 * leitor (mesmo canal, mesmas chaves VAPID, sem segundo serviço). Só recebe quem ativou
 * `staff_alerts` na própria inscrição e tem papel na audiência da notificação (a escolha é do
 * banco: `studio_urgent_push_due`). Nada do leitor entra aqui.
 */
import { internalUrl, PAYLOAD_MAX_BYTES, pushHeaders } from "@/lib/push/payload";
import type { PushSender } from "@/lib/push/sender";
import { sanitizeNotificationText, BODY_MAX, TITLE_MAX } from "@/lib/push/text";
import type { PushPayload } from "@/lib/push/types";
import { safeStudioHref } from "./group";

export interface UrgentDue {
  id: string;
  title: string;
  body: string;
  href: string;
  subs: { endpoint: string; p256dh: string; auth: string }[];
}

export interface StaffPushPort {
  /** Cria as notificações sem evento de origem (revisão vencida etc.). */
  sweep(now: Date): Promise<void>;
  due(now: Date): Promise<UrgentDue[]>;
  done(ids: string[]): Promise<void>;
}

export interface StaffPushResult {
  notifications: number;
  attempted: number;
  accepted: number;
}

/** Payload do aviso de urgência: id da notificação como tag (junta repetições) e como `s`. */
export function staffPayload(
  n: Pick<UrgentDue, "id" | "title" | "body" | "href">,
): PushPayload | null {
  const href = safeStudioHref(n.href);
  if (!internalUrl(href)) return null;
  const tag = n.id.replace(/-/g, "").slice(0, 32);
  const payload: PushPayload = {
    v: 1,
    t: sanitizeNotificationText(n.title, TITLE_MAX),
    b: sanitizeNotificationText(n.body || n.title, BODY_MAX),
    u: href,
    g: tag,
    s: n.id,
  };
  return new TextEncoder().encode(JSON.stringify(payload)).length > PAYLOAD_MAX_BYTES
    ? null
    : payload;
}

/** Varre, escolhe as urgências ainda não despachadas e envia a quem optou. Nunca lança. */
export async function dispatchStaffUrgent(
  port: StaffPushPort,
  sender: PushSender,
  now: Date,
): Promise<StaffPushResult> {
  const result: StaffPushResult = { notifications: 0, attempted: 0, accepted: 0 };
  try {
    await port.sweep(now);
    const due = await port.due(now);
    for (const n of due) {
      result.notifications++;
      const payload = staffPayload(n);
      if (payload) {
        const headers = pushHeaders("urgent", payload.g);
        for (const sub of n.subs) {
          result.attempted++;
          try {
            const out = await sender.send(sub, payload, headers);
            if (out.kind === "accepted") result.accepted++;
          } catch {
            /* uma inscrição ruim não para as outras */
          }
        }
      }
    }
    await port.done(due.map((n) => n.id));
  } catch {
    /* o drain não depende deste aviso */
  }
  return result;
}
