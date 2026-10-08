// @vitest-environment node
import { describe, expect, it } from "vitest";
import { venueRow } from "@/lib/guide/testing";
import { venuePhotos, type GuidePhoto } from "./guide";

const NAME = "places/ChIJ-teste-pao-dourado/photos/AUc7tXX-teste_ref123";
const SITE: GuidePhoto = {
  src: "/api/media/00000000-0000-4000-8000-000000000009",
  credit: "Foto: reprodução web · Padaria Pão Dourado",
  originUrl: "https://paodourado.example",
};

describe("venuePhotos (A-212)", () => {
  it("foto do site oficial vem primeiro e dispensa a do Google", () => {
    const v = venueRow({ google_photo_name: NAME });
    expect(venuePhotos(v, [SITE])).toEqual([SITE]);
  });

  it("sem foto do site, a foto do Google pela rota própria, com o crédito do autor", () => {
    const v = venueRow({
      slug: "padaria-pao-dourado-goiabeiras",
      google_photo_name: NAME,
      google_photo_author: "Maria Fictícia",
      google_photo_author_uri: "https://maps.google.com/maps/contrib/123",
      google_maps_url: "https://maps.google.com/?cid=123",
    });
    expect(venuePhotos(v, [])).toEqual([
      {
        src: "/api/guia/foto/padaria-pao-dourado-goiabeiras",
        credit: "Foto: Maria Fictícia · Google",
        originUrl: "https://maps.google.com/maps/contrib/123",
        fromGoogle: true,
      },
    ]);
  });

  it("sem autor: 'Foto: Google' com o link do lugar no Google Maps", () => {
    const v = venueRow({
      google_photo_name: NAME,
      google_maps_url: "https://maps.google.com/?cid=1",
    });
    expect(venuePhotos(v, [])[0]).toMatchObject({
      credit: "Foto: Google",
      originUrl: "https://maps.google.com/?cid=1",
    });
  });

  it("sem foto nenhuma: lista vazia (cartão tipográfico)", () => {
    expect(venuePhotos(venueRow(), [])).toEqual([]);
  });
});
