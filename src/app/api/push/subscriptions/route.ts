import { handleSubscribe } from "@/lib/push/api";
import { defaultPushApiDeps } from "@/lib/push/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cria a inscrição de push (spec 2026-09-28 §13). Só POST. */
export async function POST(req: Request) {
  return handleSubscribe(req, defaultPushApiDeps());
}
