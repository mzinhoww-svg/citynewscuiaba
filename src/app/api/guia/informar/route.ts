import { NextResponse } from "next/server";
import { submitVenueReport } from "@/lib/db/guide-report";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { clientRateKey } from "@/lib/security/rate-limit";

/**
 * "Informar problema" de um lugar do Guia (GUIA-T7): corpo `{ venueId, reason, contact? }`. Qualquer
 * aviso suspende as listas que citam o lugar até uma pessoa decidir. Limite por conexão por hora.
 */
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", field: "body" }, { status: 400 });
  }
  const r = await submitVenueReport(body, clientRateKey(req.headers, new Date()), revalidateTags);
  return NextResponse.json(r.body, { status: r.status });
}
