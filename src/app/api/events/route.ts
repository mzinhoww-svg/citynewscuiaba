import { defaultEventsDeps, handleEvents } from "@/lib/events/api";

/**
 * Eventos do leitor (tracking-plan, ADR-008). Só recebe o que o navegador pode enviar pelo
 * consentimento; sem banco configurado responde 503 e a página segue normalmente.
 */
export async function POST(req: Request) {
  return handleEvents(req, defaultEventsDeps());
}
