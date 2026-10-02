/**
 * Sender em memória (`PUSH_PROVIDER=fake`, G15): grava o que enviaria e responde por sufixo
 * de endpoint. Unit, CI e e2e sem chave VAPID.
 */
import type { PushHeaders } from "./payload";
import type { PushSender, SendOutcome, SendTarget } from "./sender";
import type { PushPayload } from "./types";

export interface FakeSent {
  endpoint: string;
  payload: PushPayload;
  headers: Record<string, unknown>;
}

export interface FakeSender extends PushSender {
  sent: FakeSent[];
  respondWith(endpointSuffix: string, outcome: SendOutcome): void;
  reset(): void;
}

export function createFakeSender(): FakeSender {
  const rules = new Map<string, SendOutcome>();
  const sent: FakeSent[] = [];
  return {
    sent,
    respondWith(suffix, outcome) {
      rules.set(suffix, outcome);
    },
    reset() {
      rules.clear();
      sent.length = 0;
    },
    async send(sub: SendTarget, payload: PushPayload, headers: PushHeaders) {
      sent.push({ endpoint: sub.endpoint, payload, headers: { ...headers } });
      for (const [suffix, outcome] of rules) if (sub.endpoint.endsWith(suffix)) return outcome;
      return { kind: "accepted" };
    },
  };
}
