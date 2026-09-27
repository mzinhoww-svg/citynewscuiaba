import { render, screen, within } from "@testing-library/react";
import type {
  AggregatedView,
  ArticleSummary,
  CollectionView,
  TopicView,
} from "@/lib/db/queries/types";
import type { Label } from "@/lib/labels";
import {
  AggregatedCard,
  ArticleCard,
  CollectionCard,
  EventDateBadge,
  NowList,
  ServiceTile,
  SourceAvatar,
  TopicSummaryCard,
} from "../index";

const now = new Date("2026-09-27T18:00:00Z");

const baseArticle: ArticleSummary = {
  id: "a1",
  slug: "qualidade-do-ar",
  href: "/materia/qualidade-do-ar",
  kind: "normalized",
  title: "Qualidade do ar em Cuiabá fica ruim pelo terceiro dia seguido",
  dek: "Fumaça de queimadas e umidade baixa mantêm o ar em nível ruim.",
  section: { slug: "clima", name: "Clima" },
  status: "published",
  publishMode: "human",
  publishedAt: "2026-09-27T17:48:00Z",
  updatedAt: "2026-09-27T17:48:00Z",
  labels: {
    shown: [
      { kind: "normalized", text: "NORMALIZADO PELO CITYNEWS", detail: "2 fontes" },
      { kind: "ai_summary", text: "RESUMO POR IA" },
      { kind: "human_reviewed", text: "REVISADO POR HUMANO", detail: "Marina Couto" },
    ],
    hidden: [],
  },
  confidence: { level: "alta", score: 0.9 },
  sourceCount: 2,
  readMinutes: 2,
  aiSummary: ["Qualidade do ar está ruim pelo terceiro dia.", "Alerta segue até o fim da semana."],
  byline: "Redação CityNews",
  topicId: null,
  urgent: false,
  sponsored: false,
};

const sixLabels: Label[] = [
  { kind: "normalized", text: "NORMALIZADO PELO CITYNEWS" },
  { kind: "ai_summary", text: "RESUMO POR IA" },
  { kind: "image_licensed", text: "IMAGEM LICENCIADA" },
  { kind: "auto_published", text: "PUBLICADO AUTOMATICAMENTE" },
  { kind: "sponsored", text: "PATROCINADO" },
  { kind: "image_ai", text: "IMAGEM GERADA POR IA" },
];
const fixtureWith6Labels: ArticleSummary = {
  ...baseArticle,
  labels: { shown: sixLabels, hidden: [] },
};

const fixtureAgg: AggregatedView = {
  id: "g1",
  title: "Viaduto da Miguel Sutil entra em nova fase e interdita duas faixas",
  url: "https://folhadocerrado.example/materia-1",
  sourceName: "Folha do Cerrado",
  sourceSlug: "folha-do-cerrado",
  publishedAt: "2026-09-27T12:15:00Z",
  summary: "A obra passa a ocupar duas faixas no sentido Centro.",
  sectionSlug: "cidade",
  topicId: null,
  labels: {
    shown: [{ kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" }],
    hidden: [],
  },
};

describe("AggregatedCard", () => {
  it("card agregado abre o original em nova aba e informa a origem", () => {
    render(<AggregatedCard item={fixtureAgg} />);
    const link = screen.getByRole("link", { name: /Abrir em Folha/ });
    expect(link).toHaveAttribute("href", "https://folhadocerrado.example/materia-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(screen.getByText("AGREGADO")).toBeInTheDocument();
  });

  it("sem resumo permitido, mostra só título, fonte e data", () => {
    render(<AggregatedCard item={{ ...fixtureAgg, summary: null }} now={now} />);
    expect(screen.queryByText(/duas faixas no sentido/)).not.toBeInTheDocument();
    expect(screen.getByText("há 5 h")).toBeInTheDocument();
  });
});

describe("ArticleCard", () => {
  it("card de matéria mostra no máximo 4 rótulos", () => {
    render(<ArticleCard variant="standard" article={fixtureWith6Labels} />);
    expect(screen.getAllByTestId("origin-label")).toHaveLength(4);
  });

  it.each(["lead", "standard", "compact", "list"] as const)(
    "variante %s: título é o link da matéria e há rótulos",
    (variant) => {
      render(<ArticleCard variant={variant} article={baseArticle} now={now} />);
      const link = screen.getByRole("link", { name: baseArticle.title });
      expect(link).toHaveAttribute("href", "/materia/qualidade-do-ar");
      expect(screen.getAllByTestId("origin-label").length).toBeGreaterThan(0);
      expect(screen.getByText("há 12 min")).toBeInTheDocument();
    },
  );

  it("manchete tem confiança e resumo em 20 s", () => {
    render(<ArticleCard variant="lead" article={baseArticle} as="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: baseArticle.title })).toBeInTheDocument();
    expect(screen.getByText("Confiança alta")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Resumo em 20 s" });
    expect(within(summary).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sem imagem aprovada, usa card tipográfico da editoria", () => {
    render(<ArticleCard variant="standard" article={baseArticle} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("typographic-cover")).toHaveTextContent("Clima");
  });
});

describe("SourceAvatar", () => {
  it("SourceAvatar sem logotipo usa monograma com nome acessível", () => {
    render(<SourceAvatar name="Folha do Cerrado" code="FC" />);
    expect(screen.getByLabelText("Folha do Cerrado")).toHaveTextContent("FC");
  });
});

describe("demais cards", () => {
  const topic: TopicView = {
    id: "t1",
    slug: "obra-do-viaduto",
    href: "/assunto/obra-do-viaduto",
    title: "Obra do viaduto na avenida Miguel Sutil",
    state: "em_apuracao",
    summary: "A construção entra em nova fase.",
    confidence: { level: "média", score: 0.72 },
    sectionSlug: "cidade",
    updatedAt: "2026-09-27T16:00:00Z",
    articleCount: 1,
    sourceCount: 4,
  };

  it("TopicSummaryCard mostra situação, confiança e contagens", () => {
    render(<TopicSummaryCard topic={topic} now={now} />);
    expect(screen.getByRole("link", { name: topic.title })).toHaveAttribute("href", topic.href);
    expect(screen.getByText("Em apuração")).toBeInTheDocument();
    expect(screen.getByText("Confiança média")).toBeInTheDocument();
    expect(screen.getByText(/1 matéria · 4 fontes/)).toBeInTheDocument();
  });

  it("CollectionCard é link com contagem de itens", () => {
    const c: CollectionView = {
      id: "c1",
      slug: "seca-e-fumaca",
      href: "/colecoes/seca-e-fumaca",
      title: "Seca e fumaça",
      description: "Alertas e cuidados.",
      itemCount: 3,
    };
    render(<CollectionCard collection={c} />);
    expect(screen.getByRole("link", { name: "Seca e fumaça" })).toHaveAttribute("href", c.href);
    expect(screen.getByText("3 itens")).toBeInTheDocument();
  });

  it("NowList tem até 6 itens, modo de publicação e próximo ciclo", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      ...baseArticle,
      id: `n${i}`,
      title: `Notícia ${i}`,
      href: `/materia/n${i}`,
    }));
    render(<NowList items={items} now={new Date("2026-09-27T18:12:00Z")} />);
    const region = screen.getByRole("region", { name: "Agora" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(6);
    expect(within(region).getAllByText("REVISADO POR HUMANO")).toHaveLength(6);
    expect(within(region).getByText("Próximo ciclo em 18 min")).toBeInTheDocument();
  });

  it("EventDateBadge mostra dia e mês com data legível por máquina", () => {
    render(<EventDateBadge startsAt="2026-10-04T10:30:00Z" />);
    const time = screen.getByText("4").closest("time");
    expect(time).toHaveAttribute("dateTime", "2026-10-04T10:30:00Z");
    expect(time).toHaveTextContent("out");
  });

  it("ServiceTile é link com título e descrição", () => {
    render(
      <ServiceTile
        href="/servicos"
        title="Vagas de emprego"
        description="Mutirão no sábado"
        icon="users"
      />,
    );
    const link = screen.getByRole("link", { name: "Vagas de emprego" });
    expect(link).toHaveAttribute("href", "/servicos");
    expect(screen.getByText("Mutirão no sábado")).toBeInTheDocument();
  });
});
