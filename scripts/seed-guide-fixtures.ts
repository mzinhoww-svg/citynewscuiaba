/**
 * Primeira leva LOCAL de listas do Guia com dados fictícios (nomes inventados; nenhum
 * estabelecimento real, nenhuma nota real). Só para desenvolvimento, e2e visual e screenshots:
 * `pnpm db:seed:guide`. Usa o mesmo domínio e as mesmas lojas do app (pontuação, propostas por
 * modelo, publicação), então o que aparece nas telas é o que o motor produz com dados assim.
 * Idempotente: apaga a leva anterior (lugares com `place_ids.osm` começando em `fixture/`).
 * Nunca roda em produção (recusa `NODE_ENV=production` e URL que não seja local).
 */
import { loadEnvConfig } from "@next/env";
import { createServiceClient } from "@/lib/db/client";
import { createGuideListStore, templateFromRow } from "@/lib/db/guide-list-store";
import { createGuideStore } from "@/lib/db/guide-store";
import { proposeForTemplate } from "@/lib/guide/engine";
import type { VenueRecord } from "@/lib/guide/types";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error("seed-guide-fixtures: só roda contra o banco local (recusado).");
  process.exit(1);
}

const db = createServiceClient();
const venues = createGuideStore(db);
const lists = createGuideListStore(db);
const NOW = new Date();
const DAY = 86_400_000;

const WORDS = [
  "Estrela do Norte", "Lua Cheia", "Sol Nascente", "Beira Rio", "Jacarandá", "Pitangueira",
  "Ipê Amarelo", "Buriti", "Cajueiro", "Sete Léguas", "Capim Dourado", "Pé de Manga",
  "Flor do Cerrado", "Rio Abaixo", "Tamarindo", "Mangueira", "Caramuru", "Pantaneiro",
];
const STREETS = ["Rua das Palmeiras", "Avenida do Ipê", "Rua do Buriti", "Rua Sete de Maio", "Avenida Beira Rio", "Rua dos Cajueiros"];
const NEIGHBORHOODS = ["Coxipó", "Centro Sul", "Porto", "Jardim Itália", "Morada da Serra", "Centro Norte", "CPA"];

interface Group {
  category: string;
  type: string;
  count: number;
  subcategory?: string;
  /** Quantos têm só duas fontes e nenhuma nota (para mostrar o corte). */
  noRating?: number;
}

const GROUPS: Group[] = [
  { category: "padaria", type: "Padaria", count: 9 },
  { category: "cafeteria", type: "Café", count: 7 },
  { category: "restaurante", type: "Restaurante", count: 12 },
  { category: "restaurante", type: "Cantina", count: 6, subcategory: "italiana" },
  { category: "restaurante", type: "Sushi", count: 6, subcategory: "japonesa" },
  { category: "pizzaria", type: "Pizzaria", count: 7 },
  { category: "hamburgueria", type: "Burger", count: 6 },
  { category: "sorveteria", type: "Sorveteria", count: 6 },
  { category: "bar", type: "Bar", count: 11 },
  { category: "hotel", type: "Hotel", count: 6 },
  { category: "parque", type: "Parque", count: 5 },
  { category: "museu", type: "Museu", count: 4, noRating: 4 },
];

function build(): VenueRecord[] {
  const out: VenueRecord[] = [];
  let seq = 0;
  for (const g of GROUPS) {
    for (let i = 0; i < g.count; i += 1) {
      seq += 1;
      const word = WORDS[(seq * 7 + i * 3) % WORDS.length]!;
      const name = `${g.type} ${word}`;
      const hasRating = i >= (g.noRating ?? 0);
      const rating = 4.9 - ((seq * 13) % 15) / 10;
      const count = 40 + ((seq * 97) % 1700);
      const nb = NEIGHBORHOODS[(seq + i) % NEIGHBORHOODS.length]!;
      out.push({
        name,
        category: g.category,
        subcategory: g.subcategory ?? null,
        neighborhood: nb,
        address: `${STREETS[(seq + i) % STREETS.length]}, ${10 + ((seq * 17) % 900)}`,
        lat: -15.58 - ((seq * 7) % 60) / 1000,
        lng: -56.12 + ((seq * 11) % 70) / 1000,
        phone: `+55 65 3${String(100 + ((seq * 31) % 899)).padStart(3, "0")}-${String(1000 + ((seq * 53) % 8999))}`,
        website: `https://${name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "")}.example`,
        instagram: null,
        hours: i % 3 === 0 ? "Mo-Sa 07:00-20:00; Su 07:00-12:00" : i % 3 === 1 ? "Mo-Su 11:00-23:00" : null,
        priceLevel: 1 + ((seq + i) % 3),
        rating: hasRating ? Math.round(rating * 10) / 10 : null,
        ratingCount: hasRating ? count : null,
        ratingSource: hasRating ? "tripadvisor" : null,
        tripadvisorRank: hasRating ? 1 + ((seq * 29) % 90) : null,
        tripadvisorUrl: hasRating ? `https://www.tripadvisor.com.br/fixture-${seq}` : null,
        googleMapsUrl: null,
        googleType: null,
        googlePhoto: null,
        placeIds: { osm: `fixture/${seq}`, ...(hasRating ? { tripadvisor: `99${seq}` } : {}) },
        sources: hasRating ? ["osm", "tripadvisor", "site"] : ["osm", "site"],
      });
    }
  }
  return out;
}

async function wipe() {
  const { data: old } = await db.from("venues").select("id").like("place_ids->>osm", "fixture/%");
  const ids = (old ?? []).map((v) => v.id);
  if (ids.length === 0) return;
  const { data: items } = await db.from("guide_list_items").select("list_id").in("venue_id", ids);
  const listIds = [...new Set((items ?? []).map((i) => i.list_id))];
  if (listIds.length) {
    await db.from("guide_proposals").delete().in("list_id", listIds);
    await db.from("guide_list_items").delete().in("list_id", listIds);
    await db.from("guide_lists").delete().in("id", listIds);
  }
  await db.from("venue_media").delete().in("venue_id", ids);
  await db.from("venue_reports").delete().in("venue_id", ids);
  await db.from("venues").delete().in("id", ids);
}

async function publish(listId: string, ageDays: number) {
  const at = new Date(NOW.getTime() - ageDays * DAY).toISOString();
  const { error } = await db
    .from("guide_lists")
    .update({
      status: "published",
      published_at: at,
      refreshed_at: at,
      next_refresh_at: new Date(NOW.getTime() + (90 - ageDays) * DAY).toISOString(),
      published_by: "rule",
    })
    .eq("id", listId);
  if (error) throw error;
  await db.from("guide_proposals").update({ status: "published", decided_by: "rule" }).eq("list_id", listId);
}

async function main() {
  await wipe();
  const records = build();
  await venues.save({ inserts: records, updates: [] }, NOW);

  const slugs = [
    "padarias-cuiaba",
    "cafeterias-cuiaba",
    "restaurantes-cuiaba",
    "restaurantes-italianos-cuiaba",
    "restaurantes-japoneses-cuiaba",
    "pizzarias-cuiaba",
    "hamburguerias-cuiaba",
    "sorveterias-cuiaba",
    "bares-cuiaba",
    "hoteis-cuiaba",
    "parques-cuiaba",
    "museus-cuiaba",
  ];
  const published: string[] = [];
  const open: string[] = [];
  for (const [i, slug] of slugs.entries()) {
    const { data: row } = await db.from("guide_templates").select("*").eq("slug", slug).maybeSingle();
    if (!row) continue;
    const out = await proposeForTemplate({ store: lists, now: () => NOW }, templateFromRow(row));
    if (out.status !== "proposed") {
      console.log(`modelo ${slug}: sem proposta (${out.status})`);
      continue;
    }
    // Os dois últimos ficam como proposta aberta (tela de Propostas do admin); o resto publica.
    if (i >= slugs.length - 2 || !out.autoPublishable) open.push(slug);
    else {
      await publish(out.listId, 2 + i * 6);
      published.push(slug);
    }
  }

  // Uma lista patrocinada pelo CityNews e uma suspensa por reclamação, para as telas de estado.
  const sponsor = published[2];
  if (sponsor) {
    await db
      .from("guide_lists")
      .update({ sponsored: true, sponsor_kind: "citynews", sponsor_name: "CityNews" })
      .eq("slug", sponsor);
  }
  const suspended = published[published.length - 1];
  if (suspended) {
    await db
      .from("guide_lists")
      .update({ status: "suspended", suspended_at: NOW.toISOString(), suspended_reason: "editor: conferência de endereços" })
      .eq("slug", suspended);
  }
  console.log(
    `leva fictícia pronta: ${records.length} lugares, ${published.length} listas publicadas (${sponsor ?? "-"} patrocinada, ${suspended ?? "-"} suspensa), ${open.length} propostas abertas`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
