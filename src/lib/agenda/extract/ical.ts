import type { RawEvent } from "../types";

/** Desdobra linhas continuadas (RFC 5545 §3.1). */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else lines.push(raw);
  }
  return lines;
}

const unescapeText = (v: string) =>
  v
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** `20261010T190000`, `...Z` ou `20261115` (dia inteiro) → ISO / "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD". */
function dateOf(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return `${y}-${mo}-${d}`;
  return z ? `${y}-${mo}-${d}T${h}:${mi}:00Z` : `${y}-${mo}-${d}T${h}:${mi}`;
}

/** `VEVENT` de um arquivo iCalendar. TZID diferente de Cuiabá não é suportado: o item é ignorado. */
export function extractIcal(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur["DTSTART"];
      const title = cur["SUMMARY"] ? unescapeText(cur["SUMMARY"].value) : "";
      const tz = /TZID=([^;:]+)/.exec(start?.params ?? "")?.[1];
      const foreignTz = tz && !/^America\/(Cuiaba|Campo_Grande|Manaus)$/.test(tz);
      if (title && start && !foreignTz) {
        const loc = cur["LOCATION"] ? unescapeText(cur["LOCATION"].value) : null;
        const [venue, ...rest] = (loc ?? "").split(",").map((s) => s.trim());
        out.push({
          title,
          start: dateOf(start.value) ?? "",
          end: cur["DTEND"] ? dateOf(cur["DTEND"].value) : null,
          venue: venue || null,
          address: rest.join(", ") || null,
          city: rest.length > 0 ? (rest[rest.length - 1] ?? null) : null,
          url: cur["URL"]?.value.trim() ?? null,
          category: cur["CATEGORIES"] ? unescapeText(cur["CATEGORIES"].value) : null,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const head = line.slice(0, idx);
      const [name = "", ...params] = head.split(";");
      cur[name.toUpperCase()] = { params: params.join(";"), value: line.slice(idx + 1) };
    }
  }
  return out;
}
