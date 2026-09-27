import { articleJsonLd, eventJsonLd } from "./jsonld";

const article = {
  slug: "plano",
  title: "Prefeitura detalha plano",
  dek: "Linha expressa",
  publishedAt: "2026-09-25T16:00:00Z",
  updatedAt: "2026-09-26T14:30:00Z",
  byline: "Redação CityNews",
  authorIsPerson: false,
  section: { slug: "mobilidade", name: "Mobilidade" },
  image: undefined,
  sources: [{ url: "https://agenciamt.example/x", title: "Plano", name: "Agência MT" }],
};

it("NewsArticle com dateModified, author e citation", () => {
  const ld = articleJsonLd(article, "https://citynews.example");
  expect(ld["@type"]).toBe("NewsArticle");
  expect(ld.headline).toBe("Prefeitura detalha plano");
  expect(ld.dateModified).toBe("2026-09-26T14:30:00Z");
  expect(ld.author).toEqual({ "@type": "Organization", name: "Redação CityNews" });
  expect(ld.citation).toEqual([
    { "@type": "CreativeWork", url: "https://agenciamt.example/x", name: "Plano" },
  ]);
  expect(ld.mainEntityOfPage).toBe("https://citynews.example/materia/plano");
});

it("Event no fuso de Cuiabá com local", () => {
  const ld = eventJsonLd(
    {
      slug: "noite",
      title: "Noite do Rasqueado",
      startsAt: "2026-10-04T00:00:00Z",
      endsAt: "2026-10-04T03:30:00Z",
      venue: "Orla do Porto",
      neighborhood: "Porto",
      isFree: true,
      priceCents: null,
      description: "Bandas",
    },
    "https://citynews.example",
  );
  expect(ld["@type"]).toBe("Event");
  expect(ld.startDate).toBe("2026-10-03T20:00:00-04:00");
  expect(ld.endDate).toBe("2026-10-03T23:30:00-04:00");
  expect(ld.location).toMatchObject({ "@type": "Place", name: "Orla do Porto" });
  expect(ld.isAccessibleForFree).toBe(true);
});
