/**
 * Descoberta de logotipo (R27): lê o `<head>` da página inicial da fonte e lista, em ordem de
 * preferência, as imagens que costumam ser a marca do veículo. Puro: não faz rede nem decodifica
 * imagem (quem baixa valida pelos bytes com `validateLogo`). SVG e `data:` nunca entram.
 */

export type LogoCandidateKind =
  "apple-touch-icon" | "icon" | "og-logo" | "manifest" | "jsonld" | "og-image";

export interface LogoCandidate {
  url: string;
  kind: LogoCandidateKind;
  /** Lado declarado em px (maior dimensão), ou `null` quando a página não declara. */
  size: number | null;
}

export const MAX_LOGO_CANDIDATES = 5;
const ICON_MIN = 96;
const MANIFEST_MIN = 192;
/** `apple-touch-icon` sem `sizes` vale 180 px (padrão do iOS). */
const APPLE_DEFAULT = 180;

type Attrs = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

function headOf(html: string): string {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const end = noComments.search(/<\/head\s*>/i);
  return end >= 0 ? noComments.slice(0, end) : noComments.slice(0, 200_000);
}

function attrsOf(tag: string): Attrs {
  const out: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) {
    const key = m[1]!.toLowerCase();
    if (!(key in out)) out[key] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function tags(head: string, name: "link" | "meta"): Attrs[] {
  return [...head.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) => attrsOf(m[1]!));
}

/** Resolve contra a base; só http(s). `data:`, `javascript:` e o resto viram `null`. */
function resolveUrl(raw: string | undefined, base: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Maior lado de `sizes="180x180 120x120"`; `any` e vazio dão `null`. */
function declaredSize(sizes: string | undefined): number | null {
  if (!sizes) return null;
  let best: number | null = null;
  for (const m of sizes.matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)) {
    const side = Math.max(Number(m[1]), Number(m[2]));
    if (best === null || side > best) best = side;
  }
  return best;
}

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
};

const isSvg = (url: string, type?: string): boolean =>
  /svg/i.test(type ?? "") || pathOf(url).endsWith(".svg") || pathOf(url).endsWith(".svgz");

/** Formatos que sabemos baixar e converter (PNG, WebP, JPEG, ICO com PNG dentro). */
const RASTER_EXT = /\.(png|webp|jpe?g|ico|gif|avif)$/;
const rasterish = (url: string, type?: string): boolean => {
  if (isSvg(url, type)) return false;
  if (type) return /^image\//i.test(type);
  const p = pathOf(url);
  return RASTER_EXT.test(p) || !/\.[a-z0-9]{2,5}$/.test(p);
};

function dedupe(list: LogoCandidate[]): LogoCandidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

const bySizeDesc = (a: LogoCandidate, b: LogoCandidate): number => (b.size ?? 0) - (a.size ?? 0);

/** URL do manifest da página (`<link rel="manifest">`), se houver. */
export function manifestUrlOf(html: string, baseUrl: string): string | null {
  for (const l of tags(headOf(html), "link")) {
    if (l.rel?.toLowerCase().split(/\s+/).includes("manifest")) {
      const url = resolveUrl(l.href, baseUrl);
      if (url) return url;
    }
  }
  return null;
}

/** Ícones de 192 px ou mais de um manifest já lido (JSON), URLs resolvidas pelo próprio manifest. */
export function candidatesFromManifest(json: unknown, manifestUrl: string): LogoCandidate[] {
  const icons = (json as { icons?: unknown } | null)?.icons;
  if (!Array.isArray(icons)) return [];
  const out: LogoCandidate[] = [];
  for (const icon of icons as Record<string, unknown>[]) {
    if (!icon || typeof icon !== "object") continue;
    const src = typeof icon.src === "string" ? icon.src : undefined;
    const type = typeof icon.type === "string" ? icon.type : undefined;
    const url = resolveUrl(src, manifestUrl);
    const size = declaredSize(typeof icon.sizes === "string" ? icon.sizes : undefined);
    if (!url || !rasterish(url, type) || size === null || size < MANIFEST_MIN) continue;
    out.push({ url, kind: "manifest", size });
  }
  return dedupe(out.sort(bySizeDesc));
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      out.push(JSON.parse(m[1]!));
    } catch {
      /* JSON-LD quebrado: ignora o bloco */
    }
  }
  return out;
}

function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  yield obj;
  for (const v of Object.values(obj)) yield* walk(v, depth + 1);
}

function jsonLdLogos(html: string, baseUrl: string): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  for (const block of jsonLdBlocks(html)) {
    for (const obj of walk(block)) {
      const logo = obj.logo;
      const raw =
        typeof logo === "string"
          ? logo
          : logo && typeof logo === "object"
            ? ((logo as Record<string, unknown>).url ??
              (logo as Record<string, unknown>).contentUrl)
            : undefined;
      const url = resolveUrl(typeof raw === "string" ? raw : undefined, baseUrl);
      if (url && rasterish(url)) out.push({ url, kind: "jsonld", size: null });
    }
  }
  return out;
}

/**
 * Candidatos a logotipo, na ordem: `apple-touch-icon` (maior primeiro), `link rel=icon` PNG/WebP
 * com `sizes` ≥ 96, `og:logo`, ícones do manifest ≥ 192 (passado em `opts.manifest`), logo do
 * JSON-LD e, por último, `og:image` só se a página a declara quadrada. No máximo 5, sem repetição.
 */
export function pickLogoCandidates(
  html: string,
  baseUrl: string,
  opts: { manifest?: { url: string; json: unknown } } = {},
): LogoCandidate[] {
  const head = headOf(html);
  const links = tags(head, "link");
  const metas = tags(head, "meta");
  const rels = (l: Attrs) => (l.rel ?? "").toLowerCase().split(/\s+/);

  const apple: LogoCandidate[] = [];
  const icons: LogoCandidate[] = [];
  for (const l of links) {
    const url = resolveUrl(l.href, baseUrl);
    if (!url || !rasterish(url, l.type)) continue;
    const r = rels(l);
    const size = declaredSize(l.sizes);
    if (r.includes("apple-touch-icon") || r.includes("apple-touch-icon-precomposed")) {
      apple.push({ url, kind: "apple-touch-icon", size: size ?? APPLE_DEFAULT });
    } else if (r.includes("icon")) {
      // Sem `sizes` não dá para saber: entra no fim da fila e o tamanho real decide ao baixar.
      if (size === null || size >= ICON_MIN) icons.push({ url, kind: "icon", size });
    }
  }
  apple.sort(bySizeDesc);
  icons.sort(bySizeDesc);

  const meta = (prop: string) =>
    metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === prop)?.content;
  const ogLogoUrl = resolveUrl(meta("og:logo"), baseUrl);
  const ogLogo: LogoCandidate[] =
    ogLogoUrl && rasterish(ogLogoUrl) ? [{ url: ogLogoUrl, kind: "og-logo", size: null }] : [];

  const manifest = opts.manifest
    ? candidatesFromManifest(opts.manifest.json, opts.manifest.url)
    : [];

  const ogImageUrl = resolveUrl(meta("og:image") ?? meta("og:image:url"), baseUrl);
  const w = Number(meta("og:image:width"));
  const h = Number(meta("og:image:height"));
  const ogImage: LogoCandidate[] =
    ogImageUrl && rasterish(ogImageUrl) && w > 0 && w === h && w >= ICON_MIN
      ? [{ url: ogImageUrl, kind: "og-image", size: w }]
      : [];

  return dedupe([
    ...apple,
    ...icons,
    ...ogLogo,
    ...manifest,
    ...jsonLdLogos(html, baseUrl),
    ...ogImage,
  ]).slice(0, MAX_LOGO_CANDIDATES);
}

/** Caminhos que muitos sites servem sem declarar no HTML (reserva, no domínio da fonte). */
export function wellKnownLogoUrls(baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  return [
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/android-chrome-512x512.png",
    "/android-chrome-192x192.png",
    "/favicon-196x196.png",
    "/favicon-192x192.png",
    "/favicon.png",
    "/favicon.ico",
  ].map((p) => `${origin}${p}`);
}

const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com"];
const NOT_PROFILE = new Set([
  "sharer",
  "sharer.php",
  "share",
  "share.php",
  "intent",
  "dialog",
  "p",
  "reel",
  "reels",
  "explore",
  "home",
  "watch",
  "hashtag",
  "tr",
  "plugins",
  "login",
  "i",
  "search",
]);
const MAX_SOCIAL = 3;

function profileUrl(raw: string, baseUrl: string): string | null {
  const resolved = resolveUrl(raw, baseUrl);
  if (!resolved) return null;
  const u = new URL(resolved);
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (!SOCIAL_HOSTS.includes(host)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!.toLowerCase();
  if (NOT_PROFILE.has(first)) return null;
  if (host === "youtube.com") {
    const ok =
      first.startsWith("@") ||
      ((first === "channel" || first === "c" || first === "user") && parts.length === 2);
    if (!ok) return null;
  } else if (parts.length > 1 && !(host === "facebook.com" && first === "pages")) {
    return null;
  }
  u.search = "";
  return u.toString();
}

/**
 * Perfis oficiais que a própria página aponta (JSON-LD `sameAs` e links do corpo): última reserva
 * para a imagem de perfil. Nunca monta URL de perfil por palpite nem aceita link de compartilhar.
 */
export function socialProfileUrls(html: string, baseUrl: string): string[] {
  const raw: string[] = [];
  for (const block of jsonLdBlocks(html)) {
    for (const obj of walk(block)) {
      const same = obj.sameAs;
      if (typeof same === "string") raw.push(same);
      else if (Array.isArray(same))
        raw.push(...same.filter((s): s is string => typeof s === "string"));
    }
  }
  for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<a\b([^>]*)>/gi)) {
    const href = attrsOf(m[1]!).href;
    if (href) raw.push(href);
  }
  const out: string[] = [];
  for (const r of raw) {
    const url = profileUrl(r, baseUrl);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= MAX_SOCIAL) break;
  }
  return out;
}

/** Imagem de perfil de uma página de perfil oficial (`og:image` ou `twitter:image`). */
export function profileImageOf(html: string, baseUrl: string): string | null {
  const metas = tags(headOf(html), "meta");
  const pick = (prop: string) =>
    metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === prop)?.content;
  const url = resolveUrl(pick("og:image") ?? pick("twitter:image"), baseUrl);
  return url && rasterish(url) ? url : null;
}
