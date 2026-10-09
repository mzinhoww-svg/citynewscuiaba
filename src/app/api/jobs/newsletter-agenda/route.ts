import { createServiceClient } from "@/lib/db/client";
import {
  agendaSystemAudit,
  findEdition,
  listRecipients,
  saveEdition,
  setEditionStatus,
} from "@/lib/db/newsletter-editions";
import { listEventsInRange } from "@/lib/db/queries/events";
import { runAgendaEdition } from "@/lib/newsletter/run-edition";
import { senderFromEnv } from "@/lib/newsletter/sender";
import { newsletterSecret } from "@/lib/newsletter/token";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { isCronAuthorized, unauthorized } from "@/lib/security/cron-auth";
import { siteUrl } from "@/lib/seo/jsonld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Teto de eventos lidos para montar a edição (a edição usa até 12). */
const EVENTS_MAX = 300;

/**
 * Newsletter "Agenda do fim de semana" (ARD-T5, spec §6): o pg_cron chama às quintas 11h45
 * (Cuiabá) com `Authorization: Bearer ${CRON_SECRET}`. Monta a edição do fim de semana com os
 * eventos públicos (cliente anônimo: confirmado e não retirado, como a Agenda), grava por
 * `(agenda-fds, sexta)`, publica a página e chama o envio (sem provedor: `aguardando_provedor`).
 * Rodar de novo na mesma semana atualiza a edição; edição já enviada não muda.
 * `?now=<ISO>` monta a edição de outra semana (reprocessar ou testar).
 */
export async function POST(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return unauthorized();
  const asked = new URL(req.url).searchParams.get("now");
  const now = asked ? new Date(asked) : new Date();
  if (Number.isNaN(now.getTime())) return Response.json({ error: "now inválido" }, { status: 400 });

  const db = createServiceClient();
  try {
    const report = await runAgendaEdition({
      now,
      siteUrl: siteUrl(),
      secret: newsletterSecret(),
      sender: senderFromEnv(),
      async loadEvents(range) {
        const r = await listEventsInRange(
          {
            from: range.start.toISOString(),
            to: new Date(range.end.getTime() + 1000).toISOString(),
          },
          EVENTS_MAX,
        );
        if (!r.ok) throw new Error(`eventos: ${r.error.kind}`);
        return r.value;
      },
      find: (list, date) => findEdition(db, list, date),
      save: (row) => saveEdition(db, row),
      setStatus: (id, status, at) => setEditionStatus(db, id, status, at),
      recipients: (list) => listRecipients(db, list),
      audit: (ref, details) => agendaSystemAudit(db, "newsletter.edition", ref, details),
      async revalidate() {
        try {
          await revalidateTags(["newsletter"]);
        } catch (e) {
          // Fora de uma requisição do Next (teste) revalidateTag não tem store; o ISR cobre.
          console.error("revalidação:", e instanceof Error ? e.message : e);
        }
      },
    });
    if (report.sendError) console.error("newsletter-agenda: envio", report.sendError);
    return Response.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("newsletter-agenda:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
