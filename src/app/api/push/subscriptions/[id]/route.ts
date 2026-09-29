import { handleDelete, handlePatch } from "@/lib/push/api";
import { defaultPushApiDeps } from "@/lib/push/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Preferências, alvos, consentimento e `last_seen_at` (token no Authorization). */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handlePatch(req, id, defaultPushApiDeps());
}

/** Apaga a inscrição (token no Authorization). */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, defaultPushApiDeps());
}
