import { isIpLiteral } from "./ip-literal";

/** Formas em que a URL da imagem aparece no texto: absoluta, sem esquema e com `&amp;`. */
function imageForms(imageUrl: string): string[] {
  const forms = new Set<string>();
  try {
    const u = new URL(imageUrl);
    // `//host/caminho` cobre https://, http:// e a forma relativa ao protocolo.
    const bare = `//${u.host}${u.pathname}${u.search}`;
    forms.add(bare);
    forms.add(bare.replace(/&/g, "&amp;"));
    forms.add(`//${u.host}${decodeURI(u.pathname)}${u.search}`);
  } catch {
    // URL inválida: só a forma literal
  }
  if (imageUrl) forms.add(imageUrl);
  return [...forms].filter(Boolean).sort((a, b) => b.length - a.length);
}

/**
 * Hosts referenciados no HTML (ou JSON) da página fora da própria URL da imagem: CDN que a página
 * declara (folhas de estilo, scripts, outras imagens). A URL da imagem sozinha não conta, em
 * nenhuma forma (absoluta, `//host/caminho`, escapada em JSON). Endereço IP nunca conta.
 */
export function cdnHostsOf(html: string, imageUrl: string): string[] {
  let text = html.slice(0, 300_000).replace(/\\\//g, "/");
  for (const form of imageForms(imageUrl)) text = text.split(form).join(" ");
  const hosts = new Set<string>();
  const re =
    /(?:https?:)?\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/gi;
  for (let m = re.exec(text); m && hosts.size < 100; m = re.exec(text)) {
    const host = (m[1] ?? "").toLowerCase();
    if (!isIpLiteral(host)) hosts.add(host);
  }
  return [...hosts];
}
