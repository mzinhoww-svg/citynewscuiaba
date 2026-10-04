import { parseHTML } from "linkedom";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import { err, ok, type Result } from "@/lib/result";
import { removeHiddenElements } from "@/lib/security/hidden";

/**
 * Site oficial do lugar: só dados de contato e horário que o próprio estabelecimento publica
 * (JSON-LD de negócio local, `tel:`, link do Instagram) e a imagem de destaque (`og:image`) que a
 * etapa de foto avalia depois. Respeita `robots.txt` (o robô se identifica como CityNewsBot),
 * limite por hora e SSRF (`crawlGet`). Nada de texto do site é copiado: o HTML é dado e só
 * campos factuais com formato conhecido saem daqui.
 */

export type SiteError = "robots" | "unavailable" | "rate_limited" | "http" | "invalid";

export interface SiteFacts {
  /** URL final da página lida (origem para o crédito da foto). */
  pageUrl: string;
  phone: string | null;
  hours: string | null;
  instagram: string | null;
  address: string | null;
  /** Imagem de destaque declarada pelo site (JSON-LD `image` ou `og:image`), absoluta. */
  imageUrl: string | null;
}

const BUSINESS_TYPES = new Set([
  "localbusiness",
  "restaurant",
  "bakery",
  "foodestablishment",
  "cafeorcoffeeshop",
  "barorpub",
  "icecreamshop",
  "fastfoodrestaurant",
  "hotel",
  "lodgingbusiness",
  "museum",
  "park",
  "touristattraction",
]);

const PHONE = /^\+?[\d\s().-]{8,20}$/;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

type Json = Record<string, unknown>;

function businessNodes(doc: Document): Json[] {
  const out: Json[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const o = n as Json;
    if (Array.isArray(o["@graph"])) visit(o["@graph"]);
    const types = asArray(o["@type"] as string | string[] | undefined).map((t) =>
      String(t).toLowerCase(),
    );
    if (types.some((t) => BUSINESS_TYPES.has(t))) out.push(o);
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ""));
    } catch {
      // JSON-LD quebrado é ignorado.
    }
  }
  return out;
}

function hoursOf(node: Json): string | null {
  const direct = asArray(node["openingHours"] as string | string[] | undefined)
    .map((h) => String(h).trim())
    .filter(Boolean);
  if (direct.length > 0) return direct.join("; ").slice(0, 300);
  const spec = asArray(node["openingHoursSpecification"] as Json | Json[] | undefined)
    .map((s) => {
      const days = asArray(s["dayOfWeek"] as string | string[] | undefined)
        .map((d) =>
          String(d)
            .replace(/^https?:\/\/schema\.org\//, "")
            .slice(0, 3),
        )
        .join(",");
      return days && s["opens"] && s["closes"]
        ? `${days} ${String(s["opens"])}-${String(s["closes"])}`
        : "";
    })
    .filter(Boolean);
  return spec.length > 0 ? spec.join("; ").slice(0, 300) : null;
}

function imageOf(node: Json, base: string): string | null {
  const raw = asArray(node["image"] as unknown)[0];
  const url =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object"
        ? String((raw as Json)["url"] ?? "")
        : "";
  return absolute(url, base);
}

function absolute(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function instagramOf(candidates: string[]): string | null {
  for (const c of candidates) {
    const m = /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(
      c.trim(),
    );
    if (m && !["p", "reel", "explore", "accounts"].includes(m[1]!.toLowerCase()))
      return `https://www.instagram.com/${m[1]}`;
  }
  return null;
}

/** Extrai os fatos de um HTML já baixado (função pura, testada com páginas fictícias). */
export function extractSiteFacts(html: string, pageUrl: string): SiteFacts {
  const { document } = parseHTML(html);
  removeHiddenElements(document);
  const node = businessNodes(document)[0];
  const tel = [...document.querySelectorAll('a[href^="tel:"]')]
    .map((a) => (a.getAttribute("href") ?? "").replace(/^tel:/i, "").trim())
    .find((t) => PHONE.test(t));
  const telephone = node ? String(node["telephone"] ?? "").trim() : "";
  const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
  const sameAs = node ? asArray(node["sameAs"] as string | string[] | undefined).map(String) : [];
  const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const addr = node?.["address"];
  const street =
    addr && typeof addr === "object" ? String((addr as Json)["streetAddress"] ?? "").trim() : "";
  return {
    pageUrl,
    phone: PHONE.test(telephone) ? telephone : (tel ?? null),
    hours: node ? hoursOf(node) : null,
    instagram: instagramOf([...sameAs, ...links]),
    address: street ? street.slice(0, 200) : null,
    imageUrl: (node ? imageOf(node, pageUrl) : null) ?? absolute(og, pageUrl),
  };
}

/** Lê a página inicial do site oficial, com `robots.txt` e limite por hora do domínio. */
export async function fetchSiteFacts(
  crawl: CrawlDeps,
  website: string,
): Promise<Result<SiteFacts, SiteError>> {
  let host: string;
  try {
    host = new URL(website).hostname.toLowerCase();
  } catch {
    return err("invalid");
  }
  const bucket = `guide-site:${host}`;
  const robots = await checkRobots(crawl, website, { bucket, limitPerHour: 20 });
  if (robots.kind === "disallowed") return err("robots");
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable") return err("unavailable");
  const res = await crawlGet(crawl, website, {
    bucket,
    limitPerHour: 20,
    accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  });
  switch (res.kind) {
    case "ok":
      return ok(extractSiteFacts(res.body, res.url));
    case "rate_limited":
      return err("rate_limited");
    case "http_error":
      return err("http");
    default:
      return err("unavailable");
  }
}
