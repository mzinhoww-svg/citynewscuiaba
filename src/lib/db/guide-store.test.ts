// @vitest-environment node
import { describe, expect, it } from "vitest";
import { venueRecord, venueRow as row } from "@/lib/guide/testing";
import { pickPhotoBackfill, venueFromRow, venueRowFields } from "./guide-store";

const NAME = "places/ChIJ-teste-pao-dourado/photos/AUc7tXX-teste_ref123";

describe("mapeamento da foto do Google (A-212)", () => {
  it("linha → registro: foto com autor e link", () => {
    const v = venueFromRow(
      row({
        google_photo_name: NAME,
        google_photo_author: "Maria Fictícia",
        google_photo_author_uri: "https://maps.google.com/maps/contrib/1",
      }),
    );
    expect(v.googlePhoto).toEqual({
      name: NAME,
      author: "Maria Fictícia",
      authorUri: "https://maps.google.com/maps/contrib/1",
    });
  });

  it("linha sem foto → null", () => {
    expect(venueFromRow(row()).googlePhoto).toBeNull();
  });

  it("registro → colunas, com e sem foto", () => {
    expect(
      venueRowFields(
        venueRecord({ googlePhoto: { name: NAME, author: "Maria Fictícia", authorUri: null } }),
      ),
    ).toMatchObject({
      google_photo_name: NAME,
      google_photo_author: "Maria Fictícia",
      google_photo_author_uri: null,
    });
    expect(venueRowFields(venueRecord())).toMatchObject({
      google_photo_name: null,
      google_photo_author: null,
      google_photo_author_uri: null,
    });
  });
});

describe("pickPhotoBackfill", () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const lists = (...venues: (ReturnType<typeof row> | null)[][]) =>
    venues.map((vs) => ({ guide_list_items: vs.map((v) => ({ venues: v })) }));

  it("só lugar ativo, com Place ID do Google e sem foto; sem repetir; até o limite", () => {
    const a = row({ id: id(1), slug: "a" });
    const comFoto = row({ id: id(2), slug: "b", google_photo_name: NAME });
    const semGoogle = row({ id: id(3), slug: "c", place_ids: { osm: "node/1" } });
    const inativo = row({ id: id(4), slug: "d", status: "inactive" });
    const e = row({ id: id(5), slug: "e" });
    const f = row({ id: id(6), slug: "f" });
    const picked = pickPhotoBackfill(lists([a, comFoto, null], [semGoogle, inativo, a, e], [f]), 2);
    expect(picked.map((v) => v.slug)).toEqual(["a", "e"]);
    expect(picked[0]!.placeIds.google).toBe("ChIJ-teste-pao-dourado");
  });

  it("mais antigos (ou nunca buscados) no Google primeiro", () => {
    const novo = row({ id: id(1), slug: "novo", google_fetched_at: "2026-10-07T00:00:00Z" });
    const velho = row({ id: id(2), slug: "velho", google_fetched_at: "2026-09-20T00:00:00Z" });
    const nunca = row({ id: id(3), slug: "nunca", google_fetched_at: null });
    expect(pickPhotoBackfill(lists([novo, velho, nunca]), 2).map((v) => v.slug)).toEqual([
      "nunca",
      "velho",
    ]);
  });

  it("limite zero ou nenhuma lista: nada", () => {
    expect(pickPhotoBackfill(lists([row()]), 0)).toEqual([]);
    expect(pickPhotoBackfill([], 10)).toEqual([]);
  });
});
