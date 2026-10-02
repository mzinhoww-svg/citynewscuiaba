import { pageMetadata } from "./metadata";

it("matéria leva og de artigo com site, idioma e datas", () => {
  const m = pageMetadata({
    title: "Plano de ônibus",
    description: "Linha expressa",
    path: "/materia/plano",
    type: "article",
    publishedTime: "2026-09-25T16:00:00Z",
    modifiedTime: "2026-09-26T14:30:00Z",
    section: "Mobilidade",
  });
  expect(m.title).toBe("Plano de ônibus · CityNews Cuiabá");
  expect(m.alternates?.canonical).toBe("/materia/plano");
  expect(m.openGraph).toMatchObject({
    type: "article",
    siteName: "CityNews Cuiabá",
    locale: "pt_BR",
    modifiedTime: "2026-09-26T14:30:00Z",
  });
});

it("sem imagem própria usa a assinatura como imagem padrão", () => {
  const m = pageMetadata({ title: "Sobre", path: "/sobre" });
  expect(JSON.stringify(m.openGraph)).toContain("/brand/citynews-horizontal.png");
  expect(m.robots).toBeUndefined();
});
