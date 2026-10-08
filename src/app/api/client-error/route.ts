import { handleClientError } from "@/lib/client-error";

/** Erro de navegador mostrado na tela "Algo deu errado": só log, sem login e sem banco. */
export async function POST(req: Request) {
  return handleClientError(req);
}
