/**
 * Funções puras do coletor incremental por sitemap (fontes `kind = 'sitemap'`): reparo do prefixo
 * truncado, título a partir do slug da URL, arquivo anual do ano corrente (America/Cuiaba) e
 * junção de dois arquivos. Nenhuma toca rede nem banco.
 */

/** Bytes lidos de um sitemap por coleta: o fim do arquivo (itens antigos) nunca é baixado. */
export const SITEMAP_PREFIX_BYTES = 512 * 1024;

const OPEN_URLSET = /<urlset\b[^>]*>/;

/**
 * Prefixo de sitemap (cortado por `prefixBytes`) → XML bem formado: descarta o que vem depois do
 * último `</url>` (inclusive uma `<url>` ou tag cortada ao meio) e fecha `</urlset>`. Documento já
 * completo, ou que não seja um `urlset`, volta intacto. Corte dentro do cabeçalho: vazio.
 */
export function repairTruncatedSitemap(xml: string): string {
  if (!/<urlset[\s>]/.test(xml)) return xml;
  if (/<\/urlset\s*>\s*$/.test(xml)) return xml;
  const end = xml.lastIndexOf("</url>");
  if (end >= 0) return `${xml.slice(0, end + "</url>".length)}</urlset>`;
  const open = OPEN_URLSET.exec(xml);
  return open ? `${xml.slice(0, open.index + open[0].length)}</urlset>` : "";
}

/** Junta as `<url>` de `b` (reparado) às de `a` (reparado). `a` vazio devolve `b` reparado. */
export function mergeSitemaps(a: string, b: string): string {
  const ra = repairTruncatedSitemap(a);
  const rb = repairTruncatedSitemap(b);
  if (!ra) return rb;
  const open = OPEN_URLSET.exec(rb);
  const close = rb.lastIndexOf("</urlset>");
  const closeA = ra.lastIndexOf("</urlset>");
  if (!open || close < 0 || closeA < 0) return ra;
  const inner = rb.slice(open.index + open[0].length, close);
  return `${ra.slice(0, closeA)}${inner}</urlset>`;
}

/**
 * Título a partir do slug da URL (sitemaps sem `news:title`): último trecho do caminho, sem
 * extensão e sem sufixo/prefixo numérico de id (5+ dígitos; um ano de 4 dígitos fica), `%XX`
 * decodificado, hífens e sublinhados viram espaço, primeira letra maiúscula, no máximo `max`.
 * `null` quando não sobra texto.
 */
export function titleFromSlug(url: string, max = 300): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const last = pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  let slug = last;
  try {
    slug = decodeURIComponent(last);
  } catch {
    // percent-encoding inválido: usa o trecho como veio
  }
  slug = slug
    .replace(/\.[a-z]{2,5}$/i, "")
    .replace(/[-_]\d{5,}$/, "")
    .replace(/^\d{5,}[-_]/, "");
  const words = slug
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\p{L}]/u.test(words)) return null;
  const title = words.charAt(0).toLocaleUpperCase("pt-BR") + words.slice(1);
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return cut.slice(0, space > max * 0.6 ? space : max).trimEnd();
}

const YEARLY = /^(.*\/)(\d{4})(\.xml)(\?.*)?$/;
const CUIABA_TZ = "America/Cuiaba";

/** Ano e dia do ano (mês/dia) de `now` no fuso de Cuiabá. */
function cuiabaDate(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CUIABA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

/**
 * Sitemap anual (`…/AAAA.xml`): usa o arquivo do ano corrente em America/Cuiaba, mesmo que o
 * `feed_url` cadastrado seja de um ano anterior. Qualquer outra URL volta como veio.
 */
export function resolveYearlySitemapUrl(url: string, now: Date): string {
  const m = YEARLY.exec(url);
  if (!m) return url;
  return `${m[1]}${cuiabaDate(now).year}${m[3]}${m[4] ?? ""}`;
}

/**
 * Nos dois primeiros dias de janeiro (Cuiabá) o arquivo novo ainda é curto, e o fim do arquivo do
 * ano anterior guarda os últimos itens de 31/12: devolve a URL do ano anterior para ser lida junto
 * (`mergeSitemaps`). Fora disso, `null`. Decisão simples: dois dias, um pedido extra por coleta.
 */
export function previousYearSitemapUrl(url: string, now: Date): string | null {
  const m = YEARLY.exec(url);
  if (!m) return null;
  const { year, month, day } = cuiabaDate(now);
  if (month !== 1 || day > 2) return null;
  return `${m[1]}${year - 1}${m[3]}${m[4] ?? ""}`;
}
