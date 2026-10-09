import type { RawEvent } from "../types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

function types(o: Obj): string[] {
  const t = o["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

const isEventType = (o: Obj) =>
  types(o).some((t) => /(^|\W)\w*Event$/.test(t) && t !== "EventSeries");

/** Percorre `@graph`, listas e `ItemList` coletando nós de evento. */
function collect(node: unknown, out: Obj[], depth = 0): void {
  if (depth > 6) return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  if (isEventType(node)) {
    out.push(node);
    return;
  }
  for (const key of ["@graph", "itemListElement", "item", "event", "events", "mainEntity"]) {
    if (key in node) collect(node[key], out, depth + 1);
  }
}

function addressParts(addr: unknown): {
  text: string | null;
  city: string | null;
  neighborhood: string | null;
} {
  if (typeof addr === "string") return { text: str(addr), city: null, neighborhood: null };
  if (!isObj(addr)) return { text: null, city: null, neighborhood: null };
  return {
    text: str(addr["streetAddress"]),
    city: str(addr["addressLocality"]),
    neighborhood: str(addr["addressNeighborhood"]) ?? str(addr["neighborhood"]),
  };
}

function priceOf(offers: unknown): number | null | undefined {
  const list = (Array.isArray(offers) ? offers : [offers]).filter(isObj);
  const prices: number[] = [];
  for (const o of list) {
    const raw = o["price"] ?? o["lowPrice"];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(
      String(raw)
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.]/g, ""),
    );
    // "40.00" e "40,00": o texto sem separador de milhar vira reais.
    const direct = Number(String(raw).replace(",", "."));
    const value = Number.isFinite(direct) ? direct : n;
    if (Number.isFinite(value) && value >= 0) prices.push(Math.round(value * 100));
  }
  if (prices.length === 0) return undefined;
  return Math.min(...prices);
}

/** `image`: texto, `ImageObject` (`url`/`contentUrl`) ou lista deles; o primeiro que servir. */
function imageOf(v: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = imageOf(x, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (isObj(v)) return str(v["url"]) ?? str(v["contentUrl"]);
  return null;
}

/** `organizer`: texto, `Organization`/`Person` com `name`, ou lista; o primeiro nome. */
function organizerOf(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first === "string") return str(first);
  return isObj(first) ? str(first["name"]) : null;
}

/** Eventos `schema.org/Event` (e subtipos) em blocos `application/ld+json` do HTML. */
export function extractJsonLd(html: string): RawEvent[] {
  const events: Obj[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      collect(JSON.parse((m[1] ?? "").trim()), events);
    } catch {
      // bloco inválido: ignora e segue
    }
  }
  const out: RawEvent[] = [];
  for (const e of events) {
    const title = str(e["name"]);
    const start = str(e["startDate"]);
    if (!title || !start) {
      if (title) out.push({ title, start: "" });
      continue;
    }
    const loc = Array.isArray(e["location"]) ? e["location"][0] : e["location"];
    const virtual = isObj(loc) && types(loc).includes("VirtualLocation");
    const online =
      virtual || /OnlineEventAttendanceMode/.test(String(e["eventAttendanceMode"] ?? ""));
    const place = isObj(loc) ? loc : null;
    const addr = addressParts(place?.["address"]);
    const free = e["isAccessibleForFree"] === true;
    const price = priceOf(e["offers"]);
    out.push({
      title,
      start,
      end: str(e["endDate"]),
      venue: str(place?.["name"]),
      address: addr.text,
      city: addr.city,
      neighborhood: addr.neighborhood,
      url: str(e["url"]),
      priceCents: free ? 0 : price,
      online,
      imageUrl: imageOf(e["image"]),
      organizer: organizerOf(e["organizer"]),
      ageRating: str(e["typicalAgeRange"]),
    });
  }
  return out;
}
