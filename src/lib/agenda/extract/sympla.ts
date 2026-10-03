import type { RawEvent } from "../types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Junta os pedaços `self.__next_f.push([1,"..."])` da página (Next.js) num texto só. */
function flight(html: string): string {
  let out = "";
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      out += JSON.parse(m[1] ?? '""') as string;
    } catch {
      // pedaço inválido: ignora
    }
  }
  return out;
}

/** Recorta o array JSON que começa em `from` (um `[`), respeitando strings. */
function arrayAt(s: string, from: number): string | null {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === "\\") i++;
    } else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return s.slice(from, i + 1);
  }
  return null;
}

/**
 * Lista de eventos que a página de busca da Sympla traz embutida (`searchDataResult.data`).
 * Só título, data, local e link: a listagem não traz preço, então o preço fica "não informado".
 */
export function extractSympla(html: string): RawEvent[] {
  const s = flight(html);
  const key = s.indexOf('"searchDataResult"');
  if (key < 0) return [];
  const data = s.indexOf('"data":[', key);
  if (data < 0) return [];
  const raw = arrayAt(s, data + '"data":'.length);
  if (!raw) return [];
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const out: RawEvent[] = [];
  for (const it of items) {
    if (!isObj(it)) continue;
    const title = str(it["name"]);
    if (!title) continue;
    const loc = isObj(it["location"]) ? it["location"] : {};
    const city = str(loc["city"]);
    out.push({
      title,
      start: str(it["start_date"]) ?? "",
      end: str(it["end_date"]),
      venue: str(loc["name"]),
      address: str(loc["address"]),
      city,
      neighborhood: str(loc["neighborhood"]),
      url: str(it["url"]),
      online: !city,
    });
  }
  return out;
}
