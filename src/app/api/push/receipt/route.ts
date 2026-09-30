import { handleReceipt } from "@/lib/push/api";
import { defaultPushApiDeps } from "@/lib/push/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recibo agregado (D-P21): só grava com Métricas no cookie `cn_consent`. */
export async function POST(req: Request) {
  return handleReceipt(req, defaultPushApiDeps());
}
