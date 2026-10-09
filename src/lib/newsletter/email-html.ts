import { NEWSLETTER_EDITION as T } from "@/content/pt-BR/newsletter";
import { SITE } from "@/content/pt-BR/site";
import { groupEditionItems, type EditionItem } from "./agenda-edition";

/**
 * HTML e texto do e-mail da "Agenda do fim de semana" (ARD-T5, spec §6). E-mail não lê CSS
 * externo nem fontes: tabelas, estilos inline e fontes do sistema; sem imagem, sem script.
 * Todo texto vem de fora (título, local, fonte) e é escapado: é dado, nunca marcação.
 * O link de descadastro é o marcador `{{unsubscribe_url}}`, trocado por destinatário no envio.
 */

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

export interface EditionForEmail {
  editionDate: string;
  rangeLabel: string;
  subject: string;
  items: readonly EditionItem[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Cores do e-mail (fora de `src/components`; o cliente de e-mail não lê os tokens CSS). */
const C = {
  page: "#f2f2f2",
  card: "#ffffff",
  ink: "#111111",
  meta: "#4a4a4a",
  line: "#dddddd",
  accent: "#F58220",
} as const;
const FONT = "Arial, Helvetica, sans-serif";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Página da edição no site. */
export function editionUrl(siteUrl: string, editionDate: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/newsletter/agenda/${editionDate}`;
}

/** Link do evento: só a página da agenda do próprio site (nunca outro esquema ou domínio). */
function eventUrl(base: string, item: EditionItem): string {
  const own = `${base}/agenda/${item.slug}`;
  return SLUG.test(item.slug) ? own : `${base}/agenda`;
}

function itemHtml(base: string, item: EditionItem): string {
  const meta = [item.when, item.where, item.price].map(escapeHtml).join(" · ");
  const origin = item.origin
    ? `<p style="margin:4px 0 0;font:13px/1.5 ${FONT};color:${C.meta};">${escapeHtml(item.origin)}</p>`
    : "";
  return `<tr><td style="padding:14px 0;border-top:1px solid ${C.line};">
<p style="margin:0;font:bold 17px/1.35 ${FONT};color:${C.ink};"><a href="${escapeHtml(eventUrl(base, item))}" style="color:${C.ink};text-decoration:underline;">${escapeHtml(item.title)}</a></p>
<p style="margin:4px 0 0;font:15px/1.5 ${FONT};color:${C.ink};">${meta}</p>${origin}
</td></tr>`;
}

export function renderEditionEmail(
  edition: EditionForEmail,
  opts: { siteUrl: string; unsubscribeUrlPlaceholder?: string },
): RenderedEmail {
  const base = opts.siteUrl.replace(/\/+$/, "");
  const unsubscribe = opts.unsubscribeUrlPlaceholder ?? UNSUBSCRIBE_PLACEHOLDER;
  const web = editionUrl(base, edition.editionDate);
  const days = groupEditionItems(edition.items);

  const body = days
    .map(
      (
        d,
      ) => `<tr><td style="padding:20px 0 4px;"><h2 style="margin:0;font:bold 19px/1.3 ${FONT};color:${C.ink};">${escapeHtml(d.dayLabel)}</h2></td></tr>
${d.items.map((i) => itemHtml(base, i)).join("\n")}`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(edition.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(T.preheader(edition.rangeLabel))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border-top:4px solid ${C.accent};">
<tr><td style="padding:24px 24px 8px;">
<p style="margin:0;font:bold 13px/1.4 ${FONT};color:${C.meta};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(SITE.name)}</p>
<h1 style="margin:6px 0 0;font:bold 24px/1.25 ${FONT};color:${C.ink};">${escapeHtml(T.name)}</h1>
<p style="margin:4px 0 0;font:16px/1.5 ${FONT};color:${C.ink};">${escapeHtml(edition.rangeLabel)}</p>
<p style="margin:12px 0 0;font:15px/1.5 ${FONT};color:${C.meta};">${escapeHtml(T.intro)}</p>
<p style="margin:12px 0 0;font:15px/1.5 ${FONT};"><a href="${escapeHtml(web)}" style="color:${C.ink};text-decoration:underline;">${escapeHtml(T.viewOnSite)}</a></p>
</td></tr>
<tr><td style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${body}
</table>
</td></tr>
<tr><td style="padding:20px 24px 24px;border-top:1px solid ${C.line};">
<p style="margin:0;font:bold 14px/1.5 ${FONT};color:${C.ink};">${escapeHtml(T.checkSource)}</p>
<p style="margin:12px 0 0;font:13px/1.5 ${FONT};color:${C.meta};">${escapeHtml(T.footerWhy)}</p>
<p style="margin:8px 0 0;font:13px/1.5 ${FONT};"><a href="${escapeHtml(unsubscribe)}" style="color:${C.ink};text-decoration:underline;">${escapeHtml(T.unsubscribe)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    `${SITE.name} · ${edition.subject}`,
    "",
    T.intro,
    "",
    ...days.flatMap((d) => [
      d.dayLabel.toUpperCase(),
      "",
      ...d.items.flatMap((i) => [
        i.title,
        [i.when, i.where, i.price].join(" · "),
        ...(i.origin ? [i.origin] : []),
        eventUrl(base, i),
        "",
      ]),
    ]),
    T.checkSource,
    "",
    T.textViewOnSite(web),
    "",
    T.footerWhy,
    T.textUnsubscribe(unsubscribe),
    "",
  ].join("\n");

  return { subject: edition.subject, html, text };
}
