import { revalidateTags } from "@/lib/pipeline/revalidate";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { revalidatePending } from "@/lib/studio/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Invalida o cache das agendadas que o pg_cron publicou (achado 10 do gate P4). O mesmo job do
 * pg_cron chama esta rota via pg_net quando há invalidação pendente; o tick também consome.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const tags = await revalidatePending(async (t) => {
    try {
      await revalidateTags(t);
    } catch (e) {
      // Fora de uma requisição do Next (teste) revalidateTag não tem store; o ISR cobre.
      console.error("revalidação:", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ tags });
}
