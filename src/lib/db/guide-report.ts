import "server-only";
import { createServiceClient } from "@/lib/db/client";
import { reportVenue } from "@/lib/guide/lifecycle";
import { createLifecycleStore } from "./guide-lifecycle-store";
import { createRateLimitHit } from "./pipeline-store";

/** Avisos por conexão por hora no "Informar problema" (o IP nunca é gravado, só o hash do dia). */
export const REPORT_LIMIT_PER_HOUR = 5;

export type ReportResponse =
  | { status: 200; body: { status: "ok" } }
  | { status: 400; body: { status: "invalid"; field: string } }
  | { status: 404; body: { status: "not_found" } }
  | { status: 429; body: { status: "rate_limited" } }
  | { status: 503; body: { status: "unavailable" } };

/**
 * "Informar problema" do lugar (GUIA-T7): confere a entrada, aplica o limite por conexão e chama
 * `reportVenue`, que tira o lugar do ar e suspende todas as listas que o citam até uma pessoa
 * decidir. Camada de banco: a rota pública não toca a service role.
 */
export async function submitVenueReport(
  body: unknown,
  rateKey: string | null,
  revalidate: (tags: string[]) => Promise<void>,
): Promise<ReportResponse> {
  if (!body || typeof body !== "object")
    return { status: 400, body: { status: "invalid", field: "body" } };
  const b = body as Record<string, unknown>;
  const venueId = typeof b["venueId"] === "string" ? b["venueId"] : "";
  const reason = typeof b["reason"] === "string" ? b["reason"] : "";
  const contact = typeof b["contact"] === "string" ? b["contact"] : null;
  try {
    const db = createServiceClient();
    if (rateKey === null) return { status: 429, body: { status: "rate_limited" } };
    const allowed = await createRateLimitHit(db)(
      "guide-report",
      rateKey,
      REPORT_LIMIT_PER_HOUR,
      3600,
    );
    if (!allowed) return { status: 429, body: { status: "rate_limited" } };
    const store = createLifecycleStore(db);
    const r = await reportVenue({ report: store.report, revalidate }, { venueId, reason, contact });
    if (!r.ok) {
      const field =
        r.error === "invalid_contact"
          ? "contact"
          : r.error === "invalid_venue"
            ? "venueId"
            : "reason";
      return { status: 400, body: { status: "invalid", field } };
    }
    return { status: 200, body: { status: "ok" } };
  } catch (e) {
    // Lugar inexistente: o banco devolve P0002 (mensagem sem dados da pessoa).
    if (e instanceof Error && /lugar inexistente|P0002/.test(e.message))
      return { status: 404, body: { status: "not_found" } };
    console.error("guia informar:", e instanceof Error ? e.message : e);
    return { status: 503, body: { status: "unavailable" } };
  }
}
