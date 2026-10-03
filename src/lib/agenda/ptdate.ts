/** Datas em português nos títulos e resumos de feeds ("17 de outubro às 19h30", "17/10 20h"). */

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const pad = (n: number) => String(n).padStart(2, "0");

function validDay(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function timeOf(text: string): string | null {
  const m = /\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?!\d)/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/**
 * Primeira data do texto. Sem ano, vale a próxima ocorrência a partir de ontem (`now`).
 * Devolve `{ date: "YYYY-MM-DD", time: "HH:mm" | null }` ou `null`.
 */
export function parsePtDate(text: string, now: Date): { date: string; time: string | null } | null {
  const t = fold(text);
  let day = 0;
  let month = 0;
  let year: number | null = null;

  const num = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t);
  const ext = new RegExp(
    `\\b(\\d{1,2})\\s*(?:º|o)?\\s+de\\s+(${Object.keys(MONTHS)
      .filter((k) => k.length > 3)
      .join(
        "|",
      )}|${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"].join("|")})\\b(?:\\s+de\\s+(\\d{4}))?`,
  ).exec(t);
  const hit = [num, ext]
    .filter((x): x is RegExpExecArray => x !== null)
    .sort((a, b) => a.index - b.index)[0];
  if (!hit) return null;
  if (hit === num) {
    day = Number(hit[1]);
    month = Number(hit[2]);
    if (hit[3]) year = Number(hit[3]) < 100 ? 2000 + Number(hit[3]) : Number(hit[3]);
  } else {
    day = Number(hit[1]);
    month = MONTHS[hit[2] ?? ""] ?? 0;
    if (hit[3]) year = Number(hit[3]);
  }
  const end = hit.index + hit[0].length;
  if (month < 1 || month > 12 || day < 1) return null;

  if (year === null) {
    const base = new Date(now.getTime() - 24 * 3_600_000);
    year = base.getUTCFullYear();
    if (new Date(Date.UTC(year, month - 1, day, 23, 59)).getTime() < base.getTime()) year += 1;
  }
  if (!validDay(year, month, day)) return null;
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: timeOf(t.slice(end)) ?? timeOf(t) };
}
