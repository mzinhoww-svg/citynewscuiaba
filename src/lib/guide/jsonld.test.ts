import { describe, expect, it } from "vitest";
import { guideListJsonLd, validHours, venueJsonLd, type VenueLdInput } from "./jsonld";

const BASE = "https://citynews.example";

describe("guideListJsonLd", () => {
  it("ItemList em ordem crescente, com url de cada lugar e data de atualização", () => {
    const ld = guideListJsonLd(
      {
        slug: "padarias-cuiaba",
        title: "As 5 melhores padarias de Cuiabá",
        updatedAt: "2026-10-03T12:00:00Z",
        items: [
          { position: 2, name: "Padaria Lua Nova", slug: "padaria-lua-nova" },
          { position: 1, name: "Padaria Pão Dourado", slug: "padaria-pao-dourado" },
        ],
      },
      BASE,
    );
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListOrder).toBe("https://schema.org/ItemListOrderAscending");
    expect(ld.numberOfItems).toBe(2);
    expect(ld.url).toBe(`${BASE}/guia-cuiaba/padarias-cuiaba`);
    expect(ld.dateModified).toBe("2026-10-03T12:00:00Z");
    expect(ld.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Padaria Pão Dourado",
        url: `${BASE}/guia-cuiaba/lugar/padaria-pao-dourado`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Padaria Lua Nova",
        url: `${BASE}/guia-cuiaba/lugar/padaria-lua-nova`,
      },
    ]);
  });
});

const venue = (over: Partial<VenueLdInput> = {}): VenueLdInput => ({
  slug: "padaria-pao-dourado",
  name: "Padaria Pão Dourado",
  category: "padaria",
  address: "Rua das Acácias, 120",
  neighborhood: "Centro Sul",
  phone: "+55 65 3000-1111",
  website: "https://paodourado.example/",
  instagram: "https://www.instagram.com/paodourado",
  hours: "Mo-Sa 06:00-20:00; Su 06:00-12:00",
  lat: -15.6012,
  lng: -56.0971,
  images: ["/api/media/11111111-1111-4111-8111-111111111111"],
  ...over,
});

describe("venueJsonLd", () => {
  it("LocalBusiness com tipo da categoria, endereço, geo, horário e imagem absoluta", () => {
    const ld = venueJsonLd(venue(), BASE);
    expect(ld["@type"]).toBe("Bakery");
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Rua das Acácias, 120",
      addressLocality: "Cuiabá",
      addressRegion: "MT",
      addressCountry: "BR",
      areaServed: "Centro Sul",
    });
    expect(ld.telephone).toBe("+55 65 3000-1111");
    expect(ld.geo).toEqual({ "@type": "GeoCoordinates", latitude: -15.6012, longitude: -56.0971 });
    expect(ld.openingHours).toEqual(["Mo-Sa 06:00-20:00", "Su 06:00-12:00"]);
    expect(ld.image).toEqual([`${BASE}/api/media/11111111-1111-4111-8111-111111111111`]);
    expect(ld.sameAs).toEqual([
      "https://paodourado.example/",
      "https://www.instagram.com/paodourado",
    ]);
    expect(ld.url).toBe(`${BASE}/guia-cuiaba/lugar/padaria-pao-dourado`);
  });

  it("nota e ranking de terceiros nunca viram aggregateRating", () => {
    const ld = venueJsonLd(venue(), BASE) as Record<string, unknown>;
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.review).toBeUndefined();
  });

  it("categoria desconhecida cai em LocalBusiness; campos ausentes somem", () => {
    const ld = venueJsonLd(
      venue({
        category: "outra",
        phone: null,
        lat: null,
        lng: null,
        hours: null,
        images: [],
        website: null,
        instagram: null,
        address: null,
        neighborhood: null,
      }),
      BASE,
    );
    expect(ld["@type"]).toBe("LocalBusiness");
    for (const k of ["telephone", "geo", "openingHours", "image", "sameAs"])
      expect(ld[k]).toBeUndefined();
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Cuiabá",
      addressRegion: "MT",
      addressCountry: "BR",
    });
  });
});

describe("validHours", () => {
  it.each([
    ["Mo-Sa 06:00-20:00", ["Mo-Sa 06:00-20:00"]],
    ["Mo,We,Fr 08:00-12:00; Sa 09:00-13:00", ["Mo,We,Fr 08:00-12:00", "Sa 09:00-13:00"]],
    ["24/7", []],
    ["Mo-Fr 08:00-18:00; PH off", []],
    ["segunda: 06:00-20:00", []],
    [null, []],
  ])("%s", (raw, expected) => {
    expect(validHours(raw)).toEqual(expected);
  });
});
