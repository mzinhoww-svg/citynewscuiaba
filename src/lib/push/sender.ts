/**
 * Entrega ao serviço de push (spec 2026-09-28 §12.3, §14; Review Focus 4). `web-push` monta a
 * requisição (aes128gcm + VAPID) e o envio sai por `fetch`, depois de reconferir a allowlist e o
 * DNS do endpoint (o DNS pode mudar entre a inscrição e o envio). Tempo limite de 10 s.
 */
import webpush from "web-push";
import type { ResolveHost } from "@/lib/pipeline/net";
import { endpointProblem, endpointResolvesSafely } from "./endpoints";
import type { PushHeaders } from "./payload";
import type { VapidConfig } from "./server";
import type { PushPayload } from "./types";

export type SendOutcome =
  | { kind: "accepted" }
  | { kind: "gone"; status: 404 | 410 }
  | { kind: "retry"; status: number | null; retryAfterSec: number | null }
  | { kind: "failed"; status: number; vapidInvalid: boolean };

export interface SendTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSender {
  send(sub: SendTarget, payload: PushPayload, headers: PushHeaders): Promise<SendOutcome>;
}

export const SEND_TIMEOUT_MS = 10_000;

/** `Retry-After` em segundos (número ou data HTTP), ou `null`. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((at - now) / 1000));
}

export function outcomeForStatus(status: number, retryAfter: string | null): SendOutcome {
  if (status === 200 || status === 201 || status === 202) return { kind: "accepted" };
  if (status === 404 || status === 410) return { kind: "gone", status };
  if (status === 429 || status >= 500)
    return { kind: "retry", status, retryAfterSec: parseRetryAfter(retryAfter) };
  return { kind: "failed", status, vapidInvalid: status === 403 };
}

export interface WebPushSenderDeps {
  resolve: ResolveHost;
  testHosts: string[];
  timeoutMs?: number;
  /** `fetch` injetável nos testes. */
  fetch?: typeof fetch;
}

export function createWebPushSender(cfg: VapidConfig, deps: WebPushSenderDeps): PushSender {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? SEND_TIMEOUT_MS;
  return {
    async send(sub, payload, headers) {
      // Bloqueado antes de qualquer requisição: allowlist, esquema, porta, credenciais e DNS.
      if (endpointProblem(sub.endpoint, deps.testHosts) !== null)
        return { kind: "failed", status: 400, vapidInvalid: false };
      if (!(await endpointResolvesSafely(new URL(sub.endpoint), deps.resolve, deps.testHosts)))
        return { kind: "failed", status: 400, vapidInvalid: false };
      let details: ReturnType<typeof webpush.generateRequestDetails>;
      try {
        details = webpush.generateRequestDetails(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: {
              subject: cfg.subject,
              publicKey: cfg.publicKey,
              privateKey: cfg.privateKey,
            },
            TTL: headers.TTL,
            urgency: headers.Urgency,
            ...(headers.Topic ? { topic: headers.Topic } : {}),
            contentEncoding: "aes128gcm",
          },
        );
      } catch {
        return { kind: "failed", status: 400, vapidInvalid: false };
      }
      const h: Record<string, string> = {};
      for (const [k, v] of Object.entries(details.headers)) h[k] = String(v);
      try {
        const res = await doFetch(details.endpoint, {
          method: "POST",
          headers: h,
          body: details.body ? new Uint8Array(details.body) : null,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "manual",
        });
        return outcomeForStatus(res.status, res.headers.get("retry-after"));
      } catch {
        return { kind: "retry", status: null, retryAfterSec: null };
      }
    },
  };
}
