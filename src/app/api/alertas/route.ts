import { NextResponse } from "next/server";
import { createEmailAlert } from "@/lib/alerts/email";
import { hitRateLimit, queueReaderEmail, saveEmailAlert } from "@/lib/db/writes";
import { ok } from "@/lib/result";
import { clientRateKey } from "@/lib/security/rate-limit";
import { NEWSLETTER_LIMIT, signedLink } from "@/lib/newsletter/server";

/**
 * Alerta por e-mail sem conta (P18): grava inativo e põe na fila o link de confirmação
 * (B-005: nada é enviado ainda). Alerta de navegador não passa por aqui: fica no aparelho.
 */
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }
  const key = clientRateKey(req.headers, new Date());
  const r = await createEmailAlert(body, {
    allow: () =>
      key === null
        ? Promise.resolve(ok(false))
        : hitRateLimit("alert", key, NEWSLETTER_LIMIT, 3600),
    save: saveEmailAlert,
    queue: queueReaderEmail,
    link: (email, id) => signedLink("/alertas/confirmar", email, [`alert:${id}`]),
  });
  const code =
    r.status === "pending"
      ? 200
      : r.status === "invalid"
        ? 400
        : r.status === "rate_limited"
          ? 429
          : 503;
  return NextResponse.json(r, { status: code });
}
