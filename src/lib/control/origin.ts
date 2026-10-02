/**
 * Confere que o cabeçalho `Origin` é do mesmo host da requisição (rotas que aceitam o cookie de
 * sessão do Estúdio). `Origin: null` (páginas com sandbox, arquivos locais) e qualquer valor que
 * não seja uma URL são recusados em vez de lançar (gate do P5, achado 16). Puro.
 */
export function sameOriginHost(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
