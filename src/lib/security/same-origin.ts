/**
 * Proteção contra requisição de outro site nas rotas de ação com cookie de sessão: o navegador
 * sempre envia `Origin` num POST; ele precisa ser o mesmo host do pedido.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
