import { render, screen, within } from "@testing-library/react";
import type { AggregatedView, ArticleSummary, TopicView } from "@/lib/db/queries/types";
import { Highlight, SearchGroupBlock, SearchResultItem } from "../index";

const aggregated: AggregatedView = {
  id: "g1",
  title: "Viaduto da Miguel Sutil entra em nova fase",
  url: "https://folhadocerrado.example/cidade/viaduto",
  sourceName: "Folha do Cerrado",
  sourceSlug: "folha-do-cerrado",
  publishedAt: "2026-09-22T12:15:00Z",
  summary: "A obra do viaduto passa a ocupar duas faixas.",
  sectionSlug: "cidade",
  topicId: "t1",
  labels: {
    shown: [{ kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" }],
    hidden: [],
  },
};

const topic: TopicView = {
  id: "t1",
  slug: "obra-do-viaduto-na-miguel-sutil",
  href: "/assunto/obra-do-viaduto-na-miguel-sutil",
  title: "Obra do viaduto na avenida Miguel Sutil",
  state: "em_apuracao",
  summary: null,
  confidence: { level: "média", score: 0.72 },
  sectionSlug: "cidade",
  updatedAt: "2026-09-26T16:15:00Z",
  articleCount: 1,
  sourceCount: 3,
};

it("Highlight marca o termo sem acento e escapa HTML", () => {
  const { container } = render(
    <p>
      <Highlight text={'<img src=x onerror="alert(1)"> ônibus'} terms={["onibus"]} />
    </p>,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("mark")?.textContent).toBe("ônibus");
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
});

it("resultado de outro veículo tem AGREGADO e abre o original em nova aba", () => {
  render(
    <SearchResultItem
      hit={{ kind: "aggregated", score: 1, item: aggregated }}
      terms={["viaduto"]}
      now={new Date("2026-09-27T18:00:00Z")}
    />,
  );
  const link = screen.getByRole("link", { name: /Viaduto da Miguel Sutil/ });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  expect(link).toHaveAccessibleName(/Abrir em Folha do Cerrado, abre em nova aba/);
  expect(screen.getByTestId("origin-label")).toHaveAttribute("data-kind", "aggregated");
});

it("grupo por assunto é uma região com o título do assunto e a lista de itens", () => {
  render(
    <SearchGroupBlock
      group={{
        topic,
        items: [
          { kind: "aggregated", score: 1, item: aggregated },
          {
            kind: "aggregated",
            score: 0.5,
            item: { ...aggregated, id: "g2", title: "Mapa de desvios" },
          },
        ],
      }}
      terms={["viaduto"]}
    />,
  );
  const region = screen.getByRole("region", { name: "Obra do viaduto na avenida Miguel Sutil" });
  expect(within(region).getAllByRole("listitem")).toHaveLength(2);
  expect(within(region).queryByText("Em apuração")).not.toBeInTheDocument();
});

const article = {
  id: "a1",
  slug: "onibus-cpa",
  href: "/materia/onibus-cpa",
  kind: "original",
  title: "Novo plano de ônibus liga o CPA ao Centro",
  dek: "A prefeitura detalhou as linhas.",
  section: { slug: "cidade", name: "Cidade" },
  status: "published",
  publishMode: "human",
  publishedAt: "2026-09-27T17:48:00Z",
  updatedAt: "2026-09-27T17:48:00Z",
  labels: { shown: [{ kind: "original", text: "ORIGINAL CITYNEWS" }], hidden: [] },
  confidence: { level: "alta", score: 0.9 },
  sourceCount: 0,
  readMinutes: 2,
  aiSummary: null,
  byline: "Redação CityNews",
  reviewer: null,
  topicId: null,
  urgent: false,
  sponsored: false,
} as unknown as ArticleSummary;

describe("resultado de matéria com miniatura", () => {
  it("sem foto usa a miniatura tipográfica da editoria (decorativa)", () => {
    render(
      <SearchResultItem hit={{ kind: "article", score: 1, item: article }} terms={["onibus"]} />,
    );
    const cover = screen.getByTestId("typographic-cover");
    expect(cover).toHaveAttribute("data-cover", "thumb");
    expect(cover).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: /Novo plano de ônibus/ })).toHaveAttribute(
      "href",
      "/materia/onibus-cpa",
    );
  });

  it("com foto aprovada mostra a imagem com texto alternativo", () => {
    const withImage = {
      ...article,
      image: {
        src: "https://cdn.example/foto.jpg",
        alt: "Ônibus no terminal",
        kind: "original",
        credit: "Ana",
      },
    } as unknown as ArticleSummary;
    render(<SearchResultItem hit={{ kind: "article", score: 1, item: withImage }} terms={[]} />);
    expect(screen.getByRole("img", { name: "Ônibus no terminal" })).toBeInTheDocument();
    expect(screen.queryByTestId("typographic-cover")).toBeNull();
  });
});
