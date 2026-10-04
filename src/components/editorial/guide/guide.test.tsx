import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dataLine, GUIDE } from "@/content/pt-BR/guide";
import type { GuideListItemView, GuideListSummary, GuideVenueView } from "@/lib/db/queries/guide";
import { CriteriaNote } from "./CriteriaNote";
import { ListCard } from "./ListCard";
import { VenueCard } from "./VenueCard";
import { VenueCover } from "./VenueCover";

const venue = (over: Partial<GuideVenueView> = {}): GuideVenueView => ({
  id: "v1",
  slug: "padaria-pao-dourado",
  href: "/guia-cuiaba/lugar/padaria-pao-dourado",
  name: "Padaria Pão Dourado",
  category: "padaria",
  subcategory: null,
  neighborhood: "Centro Sul",
  address: "Rua das Acácias, 120",
  phone: null,
  website: null,
  instagram: null,
  hours: null,
  priceLevel: 2,
  rating: 4.6,
  ratingCount: 312,
  ratingSource: "tripadvisor",
  tripadvisorRank: 7,
  tripadvisorUrl: null,
  lat: null,
  lng: null,
  sources: ["osm", "tripadvisor"],
  updatedAt: null,
  photos: [],
  ...over,
});

const item = (
  over: Partial<GuideVenueView> = {},
  note: string | null = null,
): GuideListItemView => ({
  position: 1,
  note,
  venue: venue(over),
});

const FORBIDDEN =
  /\bIA\b|inteligência artificial|gerad[oa] por|revisad|normalizad|automaticamente/i;

describe("VenueCard", () => {
  it("o nome é o link do card, com posição, bairro, preço, nota e ranking do TripAdvisor", () => {
    render(<VenueCard item={item({}, "Melhor pão francês.")} />);
    const link = screen.getByRole("link", { name: "Padaria Pão Dourado" });
    expect(link).toHaveAttribute("href", "/guia-cuiaba/lugar/padaria-pao-dourado");
    expect(link.className).toContain("card-link");
    expect(screen.getByText("1º lugar")).toBeInTheDocument();
    expect(screen.getByText("Centro Sul · $$")).toBeInTheDocument();
    expect(screen.getByText("4,6 no TripAdvisor (312 avaliações)")).toBeInTheDocument();
    expect(screen.getByText("7º no ranking do TripAdvisor em Cuiabá")).toBeInTheDocument();
    expect(screen.getByText("Melhor pão francês.")).toBeInTheDocument();
  });

  it("sem foto aprovada mostra o cartão tipográfico, nunca imagem", () => {
    const { container } = render(<VenueCard item={item()} />);
    expect(screen.getByTestId("venue-typographic-cover")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("sem nota do TripAdvisor não inventa nota; nota manual não aparece como do TripAdvisor", () => {
    render(
      <VenueCard item={item({ rating: 4.2, ratingSource: "manual", tripadvisorRank: null })} />,
    );
    expect(screen.queryByText(/no TripAdvisor/)).toBeNull();
  });

  it("não mostra rótulo de revisão, automação nem contagem de curtidas", () => {
    const { container } = render(<VenueCard item={item()} />);
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.textContent).not.toMatch(/curtid|coment/i);
  });
});

describe("VenueCover", () => {
  it("foto oficial leva crédito 'Foto: reprodução web · nome' e link da fonte", () => {
    render(
      <VenueCover
        name="Padaria Pão Dourado"
        categoryLabel="Padaria"
        size="hero"
        photo={{
          src: "/api/media/abc",
          credit: "Foto: reprodução web · Padaria Pão Dourado",
          originUrl: "https://paodourado.example/",
        }}
      />,
    );
    const fig = screen.getByTestId("venue-photo");
    expect(within(fig).getByRole("img", { name: "Foto de Padaria Pão Dourado" })).toHaveAttribute(
      "src",
      "/api/media/abc",
    );
    expect(fig).toHaveTextContent("Foto: reprodução web · Padaria Pão Dourado");
    expect(within(fig).getByRole("link", { name: "Fonte" })).toHaveAttribute(
      "href",
      "https://paodourado.example/",
    );
  });
});

describe("CriteriaNote", () => {
  it("mostra Como escolhemos, a linha Dados em texto simples e Atualizada em", () => {
    render(
      <CriteriaNote
        criteria="Reunimos padarias de Cuiabá com dados públicos."
        dataSources={["osm", "tripadvisor", "site"]}
        refreshedAt="2026-10-01T12:00:00Z"
      />,
    );
    expect(screen.getByRole("heading", { name: "Como escolhemos" })).toBeInTheDocument();
    expect(
      screen.getByText(/Dados: TripAdvisor, OpenStreetMap e sites dos lugares\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Atualizada em 01/10/2026")).toBeInTheDocument();
  });

  it("patrocínio aparece em texto e diz que não altera a ordem", () => {
    render(
      <CriteriaNote
        criteria="Critério."
        dataSources={["osm"]}
        refreshedAt="2026-10-01T12:00:00Z"
        sponsorName="CityNews"
      />,
    );
    expect(
      screen.getByText(/Patrocinado · CityNews\. O patrocínio não altera a ordem da lista\./),
    ).toBeInTheDocument();
  });
});

describe("ListCard", () => {
  const list: GuideListSummary = {
    slug: "padarias-cuiaba",
    href: "/guia-cuiaba/padarias-cuiaba",
    title: "As 5 melhores padarias de Cuiabá",
    category: "padaria",
    neighborhood: null,
    sponsored: false,
    sponsorName: null,
    publishedAt: "2026-10-01T12:00:00Z",
    refreshedAt: "2026-10-01T12:00:00Z",
    count: 5,
    preview: ["Padaria A", "Padaria B", "Padaria C"],
  };

  it("o título é o link real, com quantidade de lugares e data", () => {
    render(<ListCard list={list} />);
    expect(screen.getByRole("link", { name: list.title })).toHaveAttribute("href", list.href);
    expect(screen.getByText(/5 lugares/)).toBeInTheDocument();
    expect(screen.getByText(/Atualizada em 01\/10\/2026/)).toBeInTheDocument();
  });

  it("lista patrocinada diz Patrocinado em texto", () => {
    render(<ListCard list={{ ...list, sponsored: true, sponsorName: "CityNews" }} />);
    expect(screen.getByText("Patrocinado · CityNews")).toBeInTheDocument();
  });
});

describe("vocabulário público do Guia", () => {
  it("nenhum texto público usa IA, revisão, geração ou automação", () => {
    const flat = JSON.stringify(GUIDE);
    expect(flat).not.toMatch(FORBIDDEN);
  });

  it("dataLine: ordem fixa, vírgulas e 'e' no fim; vazio sem fontes", () => {
    expect(dataLine(["site", "osm"])).toBe("Dados: OpenStreetMap e sites dos lugares");
    expect(dataLine(["osm"])).toBe("Dados: OpenStreetMap");
    expect(dataLine(["manual", "tripadvisor", "osm", "site"])).toBe(
      "Dados: TripAdvisor, OpenStreetMap, sites dos lugares e informações da redação",
    );
    expect(dataLine([])).toBe("");
  });
});
