import { socialBuildDeps, socialSystemAudit } from "@/lib/db/social-packages";
import { buildSocialPackage } from "@/lib/social/build-package";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pacote "Agenda da semana" do Instagram (ARD-T6, spec §7): o pg_cron chama às segundas 12h UTC
 * (8h em Cuiabá) com `Authorization: Bearer ${CRON_SECRET}`. Escolhe até 6 eventos da semana,
 * monta os PNGs 1080×1350 e a legenda e grava o rascunho por `(instagram_agenda, segunda)`.
 * Idempotente: rodar de novo refaz o rascunho; pacote aprovado, publicado ou descartado não
 * muda. Render que falha deixa o rascunho com o erro (status 200: o job fez o que podia).
 * `?now=<ISO>` muda o relógio (testes); `?semana=AAAA-MM-DD` monta a semana daquela segunda.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const params = new URL(req.url).searchParams;
  // `?now=` só fora de produção ou no e2e (`CN_E2E=1`, o mesmo opt-in do relógio do push).
  const testClock = process.env.NODE_ENV !== "production" || process.env.CN_E2E === "1";
  const asked = testClock ? params.get("now") : null;
  const now = asked ? new Date(asked) : new Date();
  if (Number.isNaN(now.getTime())) return Response.json({ error: "now inválido" }, { status: 400 });
  const week = params.get("semana");
  if (week !== null && !/^\d{4}-\d{2}-\d{2}$/.test(week))
    return Response.json({ error: "semana inválida" }, { status: 400 });

  try {
    const report = await buildSocialPackage(
      socialBuildDeps({ now, ...(week ? { weekStart: week } : {}), audit: socialSystemAudit() }),
    );
    if (report.error) console.error("social-agenda:", report.error);
    return Response.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("social-agenda:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
