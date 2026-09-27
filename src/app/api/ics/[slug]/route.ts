import { getEvent } from "@/lib/db/queries";
import { toIcs } from "@/lib/ics";
import { siteUrl } from "@/lib/seo/jsonld";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Arquivo .ics do evento (P10) no fuso America/Cuiaba. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return new Response("Evento não encontrado", { status: 404 });
  const r = await getEvent(slug);
  if (!r.ok) return new Response("Agenda indisponível", { status: 503 });
  const e = r.value;
  if (!e) return new Response("Evento não encontrado", { status: 404 });
  const body = toIcs({
    uid: e.id,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venue: e.neighborhood ? `${e.venue}, ${e.neighborhood}, Cuiabá` : `${e.venue}, Cuiabá`,
    url: `${siteUrl()}${e.href}`,
    description: e.description,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
