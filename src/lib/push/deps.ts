import "server-only";
import { createServerClient, createServiceClient } from "@/lib/db/client";
import { createPushSubscriptionStore } from "@/lib/db/push-store";
import { hitRateLimit } from "@/lib/db/writes";
import { systemResolve } from "@/lib/pipeline/net";
import { rateLimitSalt } from "@/lib/security/rate-limit";
import type { PushApiDeps } from "./api";
import { testHostsFromEnv } from "./endpoints";
import { createFakeSender } from "./fake-sender";
import { createWebPushSender, type PushSender } from "./sender";
import { pushEnabled, vapidConfig } from "./server";

/** Origem do site para a checagem de `Origin` (APP_URL; em desenvolvimento, localhost). */
export function siteOrigin(): string {
  const raw = process.env.APP_URL || "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

async function sessionUserId(): Promise<string | null> {
  try {
    const db = await createServerClient();
    const { data } = await db.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export function defaultPushApiDeps(): PushApiDeps {
  return {
    store: createPushSubscriptionStore(createServiceClient()),
    hitLimit: async (bucket, key, limit, windowSec) => {
      const r = await hitRateLimit(bucket, key, limit, windowSec);
      return r.ok ? r.value : false;
    },
    salt: rateLimitSalt(),
    now: () => new Date(),
    siteOrigin: siteOrigin(),
    resolve: systemResolve,
    testHosts: testHostsFromEnv(process.env),
    enabled: pushEnabled(),
    userId: () => sessionUserId(),
  };
}

let fake: ReturnType<typeof createFakeSender> | null = null;

/** Sender por `PUSH_PROVIDER` (G15): `fake` em memória; `webpush` com VAPID. */
export function pushSender(): PushSender {
  if (process.env.PUSH_PROVIDER === "fake") {
    fake ??= createFakeSender();
    return fake;
  }
  const cfg = vapidConfig();
  if (!cfg) {
    fake ??= createFakeSender();
    return fake;
  }
  return createWebPushSender(cfg, {
    resolve: systemResolve,
    testHosts: testHostsFromEnv(process.env),
  });
}
