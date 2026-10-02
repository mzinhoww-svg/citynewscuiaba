import { NextResponse } from "next/server";
import { subscribeDeps } from "@/lib/newsletter/server";
import { subscribeNewsletter } from "@/lib/newsletter/subscribe";

/**
 * Inscrição na newsletter por POST (formulário sem JavaScript de outras páginas ou parceiros):
 * mesmo fluxo da página (listas, honeypot, limite por IP com hash, confirmação dupla).
 * Aceita `application/x-www-form-urlencoded`, `multipart/form-data` ou JSON `{ email, lists }`.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const body: unknown = await req.json();
      form = new FormData();
      if (typeof body === "object" && body !== null) {
        const b = body as { email?: unknown; lists?: unknown };
        if (typeof b.email === "string") form.set("email", b.email);
        if (Array.isArray(b.lists)) {
          form.set("picked", "1");
          for (const l of b.lists) if (typeof l === "string") form.append("lists", l);
        }
      }
    } else form = await req.formData();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }
  const r = await subscribeNewsletter(form, subscribeDeps(req.headers));
  const code =
    r.status === "invalid"
      ? 400
      : r.status === "rate_limited"
        ? 429
        : r.status === "error"
          ? 503
          : 200;
  return NextResponse.json({ status: r.status, message: r.message }, { status: code });
}
