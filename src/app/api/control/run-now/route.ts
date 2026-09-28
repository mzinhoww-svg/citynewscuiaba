import { runNowCommand } from "@/lib/studio/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * "Executar agora" por HTTP (O01), com a sessão do Estúdio (`source.manage`, auditado). Só aceita
 * pedidos da própria origem: o cookie de sessão não serve para disparar ciclos de outro site.
 * Corpo opcional `{ "sourceId": "<uuid>" }`. A tela usa a Server Action equivalente.
 */
export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json({ error: "forbidden" }, 403);
  let body: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid" }, 400);
    }
  }
  const sourceId =
    typeof body === "object" && body !== null && "sourceId" in body
      ? (body as { sourceId: unknown }).sourceId
      : undefined;
  if (sourceId !== undefined && typeof sourceId !== "string")
    return json({ error: "invalid" }, 400);
  const r = await runNowCommand(sourceId ? { sourceId } : {});
  if (r.ok) return json(r.value, 201);
  const status =
    r.error === "forbidden"
      ? 403
      : r.error === "not_found"
        ? 404
        : r.error === "invalid"
          ? 400
          : 409;
  return json({ error: r.error, message: r.message ?? null }, status);
}
