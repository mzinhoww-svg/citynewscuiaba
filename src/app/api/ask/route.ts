import { normalizeQuery } from "@/lib/search/query";
import { answerQuestion } from "@/lib/search/ask";

/**
 * Busca com IA por API (P13): resposta em streaming NDJSON, uma linha por evento:
 * `{"type":"status","step":"sources"}` logo de cara e `{"type":"answer",...}` no fim. Mesmo
 * contrato (spec §5.5), mesmos limites (20/h sem conta, 60/h com conta) e sem login.
 * GET `?q=` ou POST `{ "q": "..." }`.
 */
export const maxDuration = 60;

const MAX_QUESTION = 300;

function stream(question: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "status", step: "sources" });
      const { answer, aiOff, limit } = await answerQuestion(question);
      send({ type: "answer", answer, aiOff, limit });
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

function badRequest(): Response {
  return Response.json(
    { error: "Envie a pergunta em q." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  const q = normalizeQuery(new URL(req.url).searchParams.get("q") ?? "").slice(0, MAX_QUESTION);
  return q ? stream(q) : badRequest();
}

export async function POST(req: Request) {
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return badRequest();
  }
  const q =
    raw && typeof raw === "object" && "q" in raw && typeof raw.q === "string"
      ? normalizeQuery(raw.q).slice(0, MAX_QUESTION)
      : "";
  return q ? stream(q) : badRequest();
}
