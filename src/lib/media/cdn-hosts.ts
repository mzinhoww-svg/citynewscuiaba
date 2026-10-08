/**
 * Hosts referenciados no HTML (ou JSON) da página fora da própria URL da imagem: CDN que a página
 * declara (folhas de estilo, scripts, outras imagens). A URL da imagem sozinha não conta.
 */
export function cdnHostsOf(html: string, imageUrl: string): string[] {
  const text = html.slice(0, 300_000).replace(/\\\//g, "/");
  const stripped = imageUrl ? text.split(imageUrl).join(" ") : text;
  const hosts = new Set<string>();
  const re =
    /(?:https?:)?\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/gi;
  for (let m = re.exec(stripped); m && hosts.size < 100; m = re.exec(stripped))
    hosts.add((m[1] ?? "").toLowerCase());
  return [...hosts];
}
