/**
 * Peças da casa (ADS-T3, plano banners-padrão): produtos do próprio CityNews, sem foto de
 * pessoa nem logo de terceiros. Fonte única para o renderizador (`render-creatives.mjs`), para
 * o cadastro (`house-ads.mjs`) e para o teste que confere os PNGs em `public/ads/`.
 * Os tamanhos repetem `SLOT_FORMATS` (src/lib/ads/slots.ts); o teste garante que batem.
 */

/** @typedef {{ id: string, title: string, text: string, cta: string, href: string, tone: "tinta" | "cerrado" }} HouseMessage */

/** @type {HouseMessage[]} */
export const HOUSE_MESSAGES = [
  {
    id: "newsletter",
    title: "Cuiabá no seu e-mail",
    text: "O resumo do dia, toda manhã. Só precisa do e-mail.",
    cta: "Assinar a newsletter",
    href: "/newsletter",
    tone: "tinta",
  },
  {
    id: "alertas",
    title: "Avisos de Cuiabá no celular",
    text: "Chuva, trânsito e notícia urgente na hora em que acontecem.",
    cta: "Ativar alertas",
    href: "/alertas",
    tone: "tinta",
  },
  {
    id: "agenda",
    title: "O que fazer em Cuiabá",
    text: "Shows, feiras e eventos gratuitos da semana num lugar só.",
    cta: "Ver a agenda",
    href: "/agenda",
    tone: "cerrado",
  },
  {
    id: "guia",
    title: "Guia Cuiabá",
    text: "Onde comer, passear e resolver as coisas na cidade.",
    cta: "Abrir o guia",
    href: "/guia-cuiaba",
    tone: "cerrado",
  },
  {
    id: "anuncie",
    title: "Anuncie no CityNews",
    text: "Sua marca para quem vive Cuiabá, com regras claras e relatório.",
    cta: "Fale com a gente",
    href: "/anuncie",
    tone: "tinta",
  },
  {
    id: "evento",
    title: "Tem um evento em Cuiabá?",
    text: "Envie para a agenda do CityNews. É grátis.",
    cta: "Enviar evento",
    href: "/agenda/sugerir",
    tone: "cerrado",
  },
];

/** Tamanhos dos campos (largura × altura) e os campos que usam cada um. */
export const HOUSE_SIZES = [
  { width: 970, height: 250, slots: ["TOP"] },
  { width: 728, height: 90, slots: ["TOP", "MID", "ART-1"] },
  { width: 320, height: 100, slots: ["TOP", "MID", "ART-1"] },
  { width: 300, height: 250, slots: ["RAIL-A", "ART-2"] },
  { width: 300, height: 600, slots: ["RAIL-B"] },
  { width: 970, height: 120, slots: ["MID"] },
  { width: 728, height: 250, slots: ["ART-2"] },
  { width: 320, height: 50, slots: ["STICKY"] },
];

export const MAX_KB = 200;

export const fileName = (messageId, w, h) => `${messageId}-${w}x${h}.png`;

/** Texto alternativo: diz o que a peça oferece, sem "imagem de". */
export const altOf = (m) => `${/[?!.]$/.test(m.title) ? m.title : `${m.title}.`} ${m.cta}.`;

/**
 * Linhas das peças da casa para um site (`baseUrl`, ex.: https://citynewscuiaba.vercel.app):
 * uma peça e uma veiculação por mensagem × tamanho × campo, sem editoria (vale em todas, menos
 * as proibidas) e sem fim. O nome identifica a linha e torna o cadastro idempotente.
 */
export function houseAdRows(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error(`baseUrl inválida: ${baseUrl}`);
  const rows = [];
  for (const m of HOUSE_MESSAGES)
    for (const s of HOUSE_SIZES)
      for (const slot of s.slots)
        rows.push({
          name: `Casa · ${m.id} · ${slot} ${s.width}x${s.height}`,
          slot,
          creative: {
            kind: "display",
            slot,
            width: s.width,
            height: s.height,
            imageUrl: `${base}/ads/${fileName(m.id, s.width, s.height)}`,
            alt: altOf(m),
            href: `${base}${m.href}`,
            weight: 1,
          },
        });
  return rows;
}

const q = (v) => `'${String(v).replaceAll("'", "''")}'`;

/** SQL idempotente (peça + veiculação ativa) para aplicar no banco do site. */
export function houseAdsSql(baseUrl, startsOn) {
  const rows = houseAdRows(baseUrl);
  const lines = rows.map(
    (r) => `(${q(r.name)}, ${q(r.slot)}, ${q(JSON.stringify(r.creative))}::jsonb)`,
  );
  return `-- Peças da casa (ADS-T3): ${rows.length} veiculações; gerado por scripts/ads/house-ads.mjs.
with novas (name, slot, creative) as (values
  ${lines.join(",\n  ")}
), criadas as (
  insert into public.ad_creatives (slot, name, creative, status)
  select n.slot, n.name, n.creative, 'active' from novas n
   where not exists (select 1 from public.ad_creatives c where c.name = n.name)
  returning id, slot
)
insert into public.ad_placements (creative_id, slot, starts_on, ends_on, allowed_sections, weight, status)
select c.id, c.slot, ${q(startsOn)}::date, '2099-12-31'::date, '{}', 1, 'active' from criadas c;
`;
}
