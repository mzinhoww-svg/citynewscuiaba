/**
 * Leitura de páginas de agenda por IA (spec §4 passos 2–3). O modelo devolve cada campo com o
 * trecho literal da página; o código confere o trecho contra o texto saneado, nunca confia no
 * valor sozinho. Ano nunca é deduzido: sem ano na página nem na URL, a data é recusada.
 */
import type { CallAgent } from "@/lib/ai/call-agent";
import { eventListingSchema, eventPageSchema } from "@/lib/ai/schemas/event-extract";
import type { AiError } from "@/lib/ai/types";
import { err, ok, type Result } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { fold } from "@/lib/text/fold";
import type { RawEvent, RejectReason } from "../types";
import { verifyEvidence, type EvidenceRecord } from "./evidence";

const PAGE_CHARS = 12000;
const MAX_LINKS = 30;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Troca cada `<a href>` por "texto (URL absoluta)" antes do saneamento, que remove as tags: sem
 * isso o modelo não veria para onde cada item da listagem aponta.
 */
function withVisibleLinks(html: string, base: string): string {
  return html.replace(
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (whole, dq: string | undefined, sq: string | undefined, inner: string) => {
      const href = (dq ?? sq ?? "").trim();
      if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return inner;
      try {
        return `${inner} (${new URL(href, base).href}) `;
      } catch {
        return inner;
      }
    },
  );
}

function notesBlock(notes: string[]): string {
  const clean = notes
    .map((n) => sanitizeExternalText(n, 300).text)
    .filter((n) => n.length > 0)
    .slice(0, 10);
  if (clean.length === 0) return "";
  return `Avisos operacionais do coletor para esta fonte:\n${clean.map((n) => `- ${n}`).join("\n")}`;
}

/** Domínio registrável aproximado: últimos 2 rótulos (3 em `.com.br`, `.org.br` etc.). */
function registrable(hostname: string): string {
  const labels = hostname.toLowerCase().split(".");
  const secondLevel = new Set(["com", "org", "net", "gov", "edu"]);
  const take =
    labels.length >= 3 && secondLevel.has(labels.at(-2) ?? "") && (labels.at(-1)?.length ?? 0) === 2
      ? 3
      : 2;
  return labels.slice(-take).join(".");
}

export async function extractListingLinks(
  callAgent: CallAgent,
  input: { html: string; baseUrl: string; notes: string[] },
): Promise<Result<string[], AiError>> {
  const text = sanitizeExternalText(withVisibleLinks(input.html, input.baseUrl), PAGE_CHARS).text;
  const res = await callAgent(
    "event_extractor",
    {
      system: [
        "Tarefa: listagem de agenda. Devolva só os links absolutos das páginas individuais de evento, até 30, do mesmo site.",
        notesBlock(input.notes),
      ]
        .filter(Boolean)
        .join("\n\n"),
      data: [{ id: "listagem", text }],
      task: "Liste os links das páginas de evento presentes na listagem.",
    },
    eventListingSchema,
  );
  if (!res.ok) return res;

  let base: URL;
  try {
    base = new URL(input.baseUrl);
  } catch {
    return ok([]);
  }
  const site = registrable(base.hostname);
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of res.value.links) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || registrable(u.hostname) !== site) continue;
    u.hash = "";
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    links.push(raw.split("#")[0] ?? raw);
    if (links.length >= MAX_LINKS) break;
  }
  return ok(links);
}

/** Preço em centavos a partir do texto do campo; `undefined` quando não dá para ler. */
function priceCentsOf(text: string): number | undefined {
  const t = fold(text);
  if (/\b(gratuit[oa]|gratis|entrada franca|sem custo)\b/.test(t)) return 0;
  const m = /r\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(t);
  if (!m) return undefined;
  const reais = Number((m[1] ?? "0").replace(/\./g, ""));
  const cents = Number((m[2] ?? "0").padEnd(2, "0"));
  return reais * 100 + cents;
}

type Field = { value: string; trecho: string; ano_evidencia: "corpo" | "url" | "ausente" };

export async function extractEventPage(
  callAgent: CallAgent,
  input: { html: string; url: string; notes: string[] },
): Promise<Result<{ raw: RawEvent; evidence: EvidenceRecord }, AiError | RejectReason>> {
  const page = sanitizeExternalText(withVisibleLinks(input.html, input.url), PAGE_CHARS).text;
  const url = sanitizeExternalText(input.url, 300).text;
  const res = await callAgent(
    "event_extractor",
    {
      system: [
        "Tarefa: página de um evento. Devolva cada campo com o trecho literal da página; sem trecho, null.",
        notesBlock(input.notes),
      ]
        .filter(Boolean)
        .join("\n\n"),
      data: [{ id: "pagina", text: page }],
      task: `Extraia o evento desta página. URL da página: ${url}`,
    },
    eventPageSchema,
  );
  if (!res.ok) return res;
  const e = res.value;

  if (!e.evento) return err("extracao_invalida");
  if (!verifyEvidence(page, e.titulo.trecho)) return err("trecho_ausente");
  if (!verifyEvidence(page, e.data.trecho)) return err("trecho_ausente");

  if (e.data.ano_evidencia === "ausente") return err("sem_ano");
  const d = DATE_RE.exec(e.data.value);
  if (!d) return err("extracao_invalida");
  const year = d[1]!;
  const month = Number(d[2]);
  const day = Number(d[3]);
  const probe = new Date(Date.UTC(Number(year), month - 1, day));
  if (
    probe.getUTCFullYear() !== Number(year) ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  )
    return err("extracao_invalida");
  // O ano precisa estar onde o modelo diz: no trecho da data (corpo) ou na URL da página.
  const yearWhere = e.data.ano_evidencia === "url" ? url : e.data.trecho;
  const years: string[] = yearWhere.match(/(?<!\d)\d{4}(?!\d)/g) ?? [];
  if (!years.includes(year)) return err("sem_ano");

  const keep = (f: Field | null): Field | null => (f && verifyEvidence(page, f.trecho) ? f : null);
  const horario = (() => {
    const f = keep(e.horario);
    return f && TIME_RE.test(f.value) ? f : null;
  })();
  const local = keep(e.local);
  const cidade = keep(e.cidade);
  const preco = keep(e.preco);
  const organizador = keep(e.organizador);

  const evidence: EvidenceRecord = {
    titulo: { trecho: e.titulo.trecho, ano: e.titulo.ano_evidencia },
    data: { trecho: e.data.trecho, ano: e.data.ano_evidencia },
  };
  const optional: [Exclude<keyof EvidenceRecord, "titulo" | "data">, Field | null][] = [
    ["horario", horario],
    ["local", local],
    ["cidade", cidade],
    ["preco", preco],
    ["organizador", organizador],
  ];
  for (const [key, f] of optional)
    if (f) evidence[key] = { trecho: f.trecho, ano: f.ano_evidencia };

  const raw: RawEvent = {
    title: e.titulo.value,
    start: horario ? `${e.data.value}T${horario.value}` : e.data.value,
    venue: local?.value ?? null,
    city: cidade?.value ?? null,
    url: input.url,
  };
  if (preco) {
    const cents = priceCentsOf(preco.value);
    if (cents !== undefined) raw.priceCents = cents;
  }
  return ok({ raw, evidence });
}
