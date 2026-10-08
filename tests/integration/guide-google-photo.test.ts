// @vitest-environment node
// A-212 · Foto principal do Google contra o banco real: a referência e o crédito do autor são
// gravados e lidos junto com os dados do Google, saem no expurgo dos 30 dias, só aceitam o formato
// `places/{id}/photos/{ref}`, e a rota pública só enxerga lugar ativo de lista publicada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { googlePhotoNameFor } from "@/lib/db/guide-google-photo";
import { createGuideStore } from "@/lib/db/guide-store";
import { venueRecord } from "@/lib/guide/testing";

const db = createServiceClient();
const store = createGuideStore(db);
const mark = Date.now().toString(36);
const CATEGORY = "museu";
const photo = (n: string) => ({
  name: `places/ChIJ-${mark}-${n}/photos/ref-${mark}-${n}`,
  author: `Autor ${n}`,
  authorUri: `https://maps.google.com/maps/contrib/${n}`,
});

const listIds: string[] = [];

const rec = (n: string, lat: number, withPhoto = true) =>
  venueRecord({
    name: `Museu Foto ${mark} ${n}`,
    category: CATEGORY,
    lat,
    lng: -56.7,
    rating: 4.4,
    ratingCount: 500,
    ratingSource: "google",
    googleMapsUrl: "https://maps.google.com/?cid=77",
    googlePhoto: withPhoto ? photo(n) : null,
    placeIds: { google: `ChIJ-${mark}-${n}` },
    sources: ["google"],
  });

async function byName(n: string) {
  const { data, error } = await db
    .from("venues")
    .select("*")
    .eq("name", `Museu Foto ${mark} ${n}`)
    .single();
  if (error) throw error;
  return data;
}

async function list(status: "published" | "draft", venueIds: string[]) {
  const r = await db
    .from("guide_lists")
    .insert({
      slug: `museus-foto-${status}-${mark}`,
      title: `Lista de teste ${status}`,
      category: CATEGORY,
      criteria:
        status === "published"
          ? "Reunimos museus de Cuiabá com dados públicos e ordenamos por nota e menções. Só entram lugares com duas fontes."
          : "",
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (r.error) throw r.error;
  listIds.push(r.data.id);
  for (const [i, venue_id] of venueIds.entries()) {
    const it = await db
      .from("guide_list_items")
      .insert({ list_id: r.data.id, venue_id, position: i + 1 });
    if (it.error) throw it.error;
  }
}

beforeAll(async () => {
  const at = new Date();
  await store.save(
    {
      inserts: [rec("A", -17.1), rec("B", -17.2, false), rec("C", -17.3, false)],
      updates: [],
    },
    at,
  );
});

afterAll(async () => {
  await db.from("guide_list_items").delete().in("list_id", listIds);
  await db.from("guide_lists").delete().in("id", listIds);
  await db.from("venues").delete().like("name", `Museu Foto ${mark}%`);
});

describe("foto do Google no banco (A-212)", () => {
  it("grava e lê a referência e o autor junto com os dados do Google", async () => {
    const a = await byName("A");
    expect(a).toMatchObject({
      google_photo_name: photo("A").name,
      google_photo_author: "Autor A",
      google_photo_author_uri: "https://maps.google.com/maps/contrib/A",
    });
    const loaded = await store.loadCategory(CATEGORY);
    expect(loaded.find((v) => v.id === a.id)?.googlePhoto).toEqual(photo("A"));
    expect((await byName("B")).google_photo_name).toBeNull();
  });

  it("atualização troca a foto pela nova", async () => {
    const b = await byName("B");
    const loaded = (await store.loadCategory(CATEGORY)).find((v) => v.id === b.id)!;
    await store.save(
      {
        inserts: [],
        updates: [
          {
            id: b.id,
            record: { ...loaded, googlePhoto: photo("B2") },
            ratingChecked: false,
            googleChecked: true,
          },
        ],
      },
      new Date(),
    );
    expect((await byName("B")).google_photo_name).toBe(photo("B2").name);
  });

  it("o banco recusa referência fora do formato e link de autor sem https", async () => {
    const a = await byName("A");
    const bad = await db
      .from("venues")
      .update({ google_photo_name: "places/x/photos/../../segredo" })
      .eq("id", a.id);
    expect(bad.error).not.toBeNull();
    const http = await db
      .from("venues")
      .update({ google_photo_author_uri: "http://inseguro.example" })
      .eq("id", a.id);
    expect(http.error).not.toBeNull();
  });

  it("missingGooglePhotos traz só lugar de lista publicada sem foto; a rota pública só lê lista publicada", async () => {
    const a = await byName("A");
    const c = await byName("C");
    const d = (await byName("B")).id; // já tem foto (B2)
    await list("published", [a.id, c.id]);
    const missing = await store.missingGooglePhotos(50);
    const ours = missing.filter((v) => v.name.startsWith(`Museu Foto ${mark}`));
    expect(ours.map((v) => v.id)).toEqual([c.id]);
    expect(ours[0]!.placeIds.google).toBe(`ChIJ-${mark}-C`);

    expect(await googlePhotoNameFor(a.slug)).toBe(photo("A").name);
    // Fora de lista publicada (só em rascunho), a RLS esconde o lugar.
    await list("draft", [d]);
    expect(await googlePhotoNameFor((await byName("B")).slug)).toBeNull();
    expect(await googlePhotoNameFor(c.slug)).toBeNull(); // publicado, mas sem foto
  });

  it("o expurgo dos 30 dias apaga a foto junto com o resto do Google", async () => {
    const a = await byName("A");
    await db.from("venues").update({ google_fetched_at: "2026-01-01T00:00:00Z" }).eq("id", a.id);
    await store.expireGoogle(new Date("2026-02-01T00:00:00Z"));
    expect(await byName("A")).toMatchObject({
      google_photo_name: null,
      google_photo_author: null,
      google_photo_author_uri: null,
      google_maps_url: null,
    });
  });
});
