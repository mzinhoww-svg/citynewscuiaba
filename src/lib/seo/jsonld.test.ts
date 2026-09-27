import {
  articleJsonLd,
  breadcrumbJsonLd,
  eventJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "./jsonld";

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

it("BreadcrumbList com posições e URLs absolutas", () => {
  const ld = breadcrumbJsonLd(
    [
      { name: "Início", path: "/" },
      { name: "Cidade", path: "/cidade" },
      { name: "Plano", path: "/materia/plano" },
    ],
    "https://citynews.example",
  );
  expect(ld["@type"]).toBe("BreadcrumbList");
  expect(ld.itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Início", item: "https://citynews.example/" },
    { "@type": "ListItem", position: 2, name: "Cidade", item: "https://citynews.example/cidade" },
    {
      "@type": "ListItem",
      position: 3,
      name: "Plano",
      item: "https://citynews.example/materia/plano",
    },
  ]);
});

it("Organization e WebSite com SearchAction para a busca", () => {
  const org = organizationJsonLd("https://citynews.example");
  expect(org["@type"]).toBe("NewsMediaOrganization");
  expect(org.name).toBe("CityNews Cuiabá");
  expect(org.correctionsPolicy).toBe("https://citynews.example/correcoes");
  const site = websiteJsonLd("https://citynews.example");
  expect(site["@type"]).toBe("WebSite");
  expect(site.potentialAction).toEqual({
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://citynews.example/busca?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  });
});
