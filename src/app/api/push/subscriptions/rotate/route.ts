import { handleRotate } from "@/lib/push/api";
import { defaultPushApiDeps } from "@/lib/push/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `pushsubscriptionchange`: troca endpoint e chaves com o token e o endpoint antigo. */
export async function PUT(req: Request) {
  return handleRotate(req, defaultPushApiDeps());
}
