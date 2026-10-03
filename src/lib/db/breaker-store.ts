import "server-only";
import { z } from "zod";
import type { BreakerStore } from "@/lib/pipeline/breaker";
import type { Json } from "@/lib/db/types";
import type { DbClient } from "./client";

const Snapshot = z.object({
  publishedLastHour: z.coerce.number(),
  publishedToday: z.coerce.number(),
  reportsLastHour: z.coerce.number(),
  aiCallsLastHour: z.coerce.number(),
  aiFailuresLastHour: z.coerce.number(),
  limits: z.object({
    hourly: z.number(),
    daily: z.number(),
    reportsPerHour: z.number(),
    aiFailuresPerHour: z.number(),
  }),
  trippedAt: z.string().nullable(),
});

/** Contagens e abertura do disjuntor (service role): `publish_counts` e `publish_breaker_trip` (0073). */
export function createBreakerStore(db: DbClient): BreakerStore {
  return {
    async counts(now) {
      const { data, error } = await db.rpc("publish_counts", { p_now: now.toISOString() });
      if (error) throw new Error(`breaker-store: counts: ${error.message}`);
      const s = Snapshot.safeParse(data);
      if (!s.success) throw new Error(`breaker-store: counts: ${s.error.message}`);
      const { limits, trippedAt, ...counts } = s.data;
      return { counts, limits, tripped: trippedAt !== null };
    },
    async trip(reason, detail) {
      const { data, error } = await db.rpc("publish_breaker_trip", {
        p_reason: reason,
        p_detail: detail as unknown as Json,
      });
      if (error) throw new Error(`breaker-store: trip: ${error.message}`);
      return data === true;
    },
  };
}
