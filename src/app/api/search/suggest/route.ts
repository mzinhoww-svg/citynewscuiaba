import { suggest } from "@/lib/search/server";

/**
 * Autocomplete da busca (P12): até 6 títulos do acervo público que começam com `?q=`, sem
 * acento. Sem banco, lista vazia (o campo continua buscando). Cache curto no navegador.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const result = await suggest(q);
  return Response.json(
    { suggestions: result.ok ? result.value : [] },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
