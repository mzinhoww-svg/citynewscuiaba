export interface CreditSource {
  id: string;
  name: string;
  baseUrl: string;
}

export interface CreditInput {
  sourceName?: string | null;
  sourceId?: string | null;
  originUrl?: string | null;
  pageUrl?: string | null;
}

function hostOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const sameSite = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

/**
 * Nome do veículo para o crédito da foto de terceiros: nome gravado na imagem, depois a fonte
 * pelo id, depois a fonte cujo site contém o endereço da imagem ou da página. Só no fim usa o
 * host da página da matéria (nunca o host de CDN da imagem).
 */
export function creditName(input: CreditInput, sources: CreditSource[]): string | undefined {
  const saved = input.sourceName?.trim();
  if (saved) return saved;
  const byId = input.sourceId ? sources.find((s) => s.id === input.sourceId) : undefined;
  if (byId) return byId.name;
  const hosts = [hostOf(input.pageUrl), hostOf(input.originUrl)].filter((h): h is string => !!h);
  for (const s of sources) {
    const site = hostOf(s.baseUrl);
    if (site && hosts.some((h) => sameSite(h, site))) return s.name;
  }
  return hostOf(input.pageUrl);
}
