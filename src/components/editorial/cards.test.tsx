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
  SectionTile,
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
  reviewer: "Marina Couto",
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

  it("texto do card = título, resumo próprio, data e link; uma só plaqueta AGREGADO · fonte", () => {
    const item: AggregatedView = {
      ...fixtureAgg,
      labels: {
        shown: [
          { kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" },
          { kind: "ai_summary", text: "RESUMO POR IA" },
        ],
        hidden: [],
      },
    };
    const { container } = render(<AggregatedCard item={item} now={now} />);
    expect(screen.getAllByTestId("origin-label")).toHaveLength(1);
    expect(screen.queryByText(/RESUMO POR IA/)).not.toBeInTheDocument();
    const text = container.textContent ?? "";
    const rest = [
      "Abrir em Folha do Cerrado",
      "AGREGADO",
      "Folha do Cerrado",
      item.title,
      item.summary!,
      "há 5 h",
      "abre em nova aba",
    ].reduce((t, part) => t.split(part).join(""), text);
    // Nada além do permitido (sobram só separadores e pontuação).
    expect(rest.replace(/[\s.,·:]/g, "")).toBe("");
  });
});

describe("AggregatedCard · plaqueta única", () => {
  it("sem rótulo AGREGADO nos dados, ainda mostra 1 plaqueta AGREGADO · fonte e nunca ORIGINAL", () => {
    const item: AggregatedView = {
      ...fixtureAgg,
      labels: {
        shown: [
          { kind: "original", text: "ORIGINAL CITYNEWS" },
          { kind: "ai_summary", text: "RESUMO POR IA" },
        ],
        hidden: [],
      },
    };
    const { container } = render(<AggregatedCard item={item} now={now} />);
    const plaques = screen.getAllByTestId("origin-label");
    expect(plaques).toHaveLength(1);
    expect(plaques[0]).toHaveTextContent("AGREGADO");
    expect(plaques[0]).toHaveTextContent("Folha do Cerrado");
    expect(container.textContent).not.toMatch(/ORIGINAL CITYNEWS|\bIA\b|intelig|normaliz/i);
  });

  it("resumo curto em texto simples, sem rótulo", () => {
    render(<AggregatedCard item={fixtureAgg} now={now} />);
    const summary = screen.getByText(fixtureAgg.summary!);
    expect(summary.tagName).toBe("P");
    expect(summary.className).toMatch(/line-clamp-2/);
  });
});

describe("ArticleCard", () => {
  it("pauta quente: 'Em alta em Cuiabá' em texto sobre o título, sem plaqueta e sem tirar a origem", () => {
    const original: ArticleSummary = { ...baseArticle, kind: "original" };
    render(<ArticleCard variant="lead" as="h1" article={original} kicker="Em alta em Cuiabá" />);
    const kicker = screen.getByTestId("card-kicker");
    expect(kicker).toHaveTextContent("Em alta em Cuiabá");
    expect(kicker.tagName).toBe("P");
    // Vem antes do título, no fluxo do texto.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(kicker.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A plaqueta continua sendo só a de origem.
    expect(screen.getAllByTestId("origin-label")).toHaveLength(1);
    expect(screen.getByTestId("origin-label")).toHaveTextContent("ORIGINAL CITYNEWS");
  });

  it("sem kicker, nada de 'Em alta'", () => {
    const { container } = render(<ArticleCard variant="lead" article={baseArticle} />);
    expect(screen.queryByTestId("card-kicker")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Em alta/);
  });

  it("card com 4 rótulos de dados mostra no máximo 1 plaqueta e a origem em texto", () => {
    const article: ArticleSummary = {
      ...baseArticle,
      kind: "original",
      publishMode: "auto",
      sponsored: true,
      labels: { shown: sixLabels.slice(0, 4), hidden: sixLabels.slice(4) },
    };
    const { container } = render(<ArticleCard variant="standard" article={article} />);
    expect(screen.getAllByTestId("origin-label")).toHaveLength(1);
    expect(screen.getByTestId("origin-label")).toHaveTextContent("ORIGINAL CITYNEWS");
    expect(screen.getByText("Patrocinado")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /NORMALIZADO|RESUMO POR IA|PUBLICADO AUTOMATICAMENTE|IMAGEM GERADA|revisad|automátic/i,
    );
  });

  it("texto derivado não ganha plaqueta: a origem vai em texto, sem revisão", () => {
    const { container } = render(
      <ArticleCard variant="standard" article={baseArticle} now={now} />,
    );
    expect(screen.queryByTestId("origin-label")).not.toBeInTheDocument();
    expect(screen.getByText("Feito a partir de 2 fontes")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/revisad|Marina Couto/i);
  });

  it.each(["lead", "standard", "compact", "list"] as const)(
    "variante %s: título é o link da matéria, com a origem em texto",
    (variant) => {
      render(<ArticleCard variant={variant} article={baseArticle} now={now} />);
      const link = screen.getByRole("link", { name: baseArticle.title });
      expect(link).toHaveAttribute("href", "/materia/qualidade-do-ar");
      expect(screen.getByText("Feito a partir de 2 fontes")).toBeInTheDocument();
      expect(screen.getByText("há 12 min")).toBeInTheDocument();
    },
  );

  it.each([
    ["lead", "type-headline-xl"],
    ["standard", "type-headline"],
    ["list", "type-headline-md"],
    ["compact", "type-headline-md"],
  ] as const)("escala de manchete: %s usa %s", (variant, cls) => {
    render(<ArticleCard variant={variant} article={baseArticle} />);
    const heading = screen.getByRole("heading", { name: baseArticle.title });
    expect(heading.className.split(/\s+/)).toContain(cls);
  });

  it("manchete tem resumo em poucos segundos e nenhum nível de confiança (R13)", () => {
    const { container } = render(<ArticleCard variant="lead" article={baseArticle} as="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: baseArticle.title })).toBeInTheDocument();
    expect(screen.queryByText(/confian/i)).not.toBeInTheDocument();
    expect(container.querySelector("[data-bar]")).toBeNull();
    expect(screen.queryByRole("img", { name: /confian/i })).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Resumo em poucos segundos" });
    expect(within(summary).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sem imagem aprovada, o standard usa miniatura tipográfica da editoria (ícone, sem bloco Tinta)", () => {
    render(<ArticleCard variant="standard" article={baseArticle} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const cover = screen.getByTestId("typographic-cover");
    expect(cover.className).toContain("bg-section");
    expect(cover.className).not.toContain("bg-tinta");
    expect(cover.querySelector("svg use")).toHaveAttribute("href", "#icon-newspaper");
    expect(cover.style.aspectRatio || cover.className).toBeTruthy();
  });

  it("lead sem foto vira cabeçalho tipográfico compacto (altura ≤ 96 px) e a manchete sobe", () => {
    render(<ArticleCard variant="lead" article={baseArticle} as="h1" />);
    const cover = screen.getByTestId("typographic-cover");
    expect(cover).toHaveAttribute("data-cover", "header");
    expect(cover.className.split(/\s+/)).toContain("h-12"); // 48 px (token de espaçamento)
    expect(cover.className).not.toMatch(/aspect-/);
    expect(cover).toHaveTextContent("Clima");
    expect(cover.className).not.toContain("bg-tinta");
    // a capa vem antes do título, mas sem ocupar a área de uma foto 16:9
    const heading = screen.getByRole("heading", { level: 1 });
    expect(cover.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lead com foto usa Photo 16:9 e não mostra a capa tipográfica", () => {
    const article = {
      ...baseArticle,
      image: { src: "/f.jpg", alt: "Fumaça", kind: "original" as const },
    };
    const { container } = render(<ArticleCard variant="lead" article={article} as="h1" />);
    expect(screen.queryByTestId("typographic-cover")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fumaça" })).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style.aspectRatio).toBe(
      "16/9",
    );
  });

  it("standard com foto usa 3:2 fixo", () => {
    const article = {
      ...baseArticle,
      image: { src: "/f.jpg", alt: "Fumaça", kind: "original" as const },
    };
    const { container } = render(<ArticleCard variant="standard" article={article} />);
    expect(container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style.aspectRatio).toBe(
      "3/2",
    );
  });

  describe.each(["compact", "list"] as const)("miniatura na variante %s", (variant) => {
    it("com foto aprovada: miniatura quadrada de tamanho fixo (CLS zero)", () => {
      const article = {
        ...baseArticle,
        image: { src: "/f.jpg", alt: "Fumaça sobre o rio", kind: "original" as const },
      };
      const { container } = render(<ArticleCard variant={variant} article={article} />);
      expect(screen.getByRole("img", { name: "Fumaça sobre o rio" })).toBeInTheDocument();
      const box = container.querySelector<HTMLElement>('[style*="aspect-ratio"]');
      expect(box?.style.aspectRatio).toBe("1 / 1");
      expect(box?.className).toMatch(/\bsize-(20|24)\b/);
      expect(screen.queryByTestId("typographic-cover")).not.toBeInTheDocument();
    });

    it("sem foto: miniatura tipográfica Névoa com ícone da editoria, sem bloco Tinta", () => {
      render(<ArticleCard variant={variant} article={baseArticle} />);
      const cover = screen.getByTestId("typographic-cover");
      expect(cover.className).toContain("bg-section");
      expect(cover.className).not.toContain("bg-tinta");
      expect(cover.className).toMatch(/\bsize-(20|24)\b/);
      expect(cover.querySelector("svg use")).toHaveAttribute("href", "#icon-newspaper");
      expect(cover).toHaveAttribute("aria-hidden", "true");
    });

    it("editoria mapeada usa o ícone dela; sem mapa, padrão neutro (jornal)", () => {
      const cidade = { ...baseArticle, section: { slug: "cidade", name: "Cidade" } };
      const { unmount } = render(<ArticleCard variant={variant} article={cidade} />);
      expect(screen.getByTestId("typographic-cover").querySelector("svg use")).toHaveAttribute(
        "href",
        "#icon-house",
      );
      unmount();
      render(<ArticleCard variant={variant} article={baseArticle} />);
      expect(screen.getByTestId("typographic-cover").querySelector("svg use")).toHaveAttribute(
        "href",
        "#icon-newspaper",
      );
    });

    it("foto de terceiros: texto acessível inclui 'Reprodução web · Fonte'", () => {
      const article = {
        ...baseArticle,
        image: {
          src: "/f.jpg",
          alt: "Fumaça sobre o rio",
          kind: "reproduction" as const,
          credit: "MT Agora",
        },
      };
      render(<ArticleCard variant={variant} article={article} />);
      expect(screen.getByRole("img", { name: /Reprodução web · MT Agora/ })).toBeInTheDocument();
    });
  });

  it("foto de terceiros em lead/standard: legenda 'Reprodução web · Fonte' com crédito e 'Ver original', fora da área recortada", () => {
    const article = {
      ...baseArticle,
      image: {
        src: "/f.jpg",
        alt: "Fumaça",
        kind: "reproduction" as const,
        credit: "MT Agora",
        author: "Ana Souza",
        originUrl: "https://mtagora.example/materia-1",
      },
    };
    render(<ArticleCard variant="standard" article={article} />);
    const caption = screen.getByText(/Reprodução web · MT Agora/);
    expect(caption).toHaveTextContent("Foto: Ana Souza");
    const photoBox = screen.getByRole("img", { name: /Fumaça/ }).parentElement!;
    expect(photoBox.contains(caption)).toBe(false);
    const link = screen.getByRole("link", { name: /Ver original/ });
    expect(link).toHaveAttribute("href", "https://mtagora.example/materia-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(photoBox.contains(link)).toBe(false);
  });

  it("card usa só a capa: a imagem do texto da matéria não aparece", () => {
    const article = {
      ...baseArticle,
      image: { src: "/capa.jpg", alt: "Capa", kind: "reproduction" as const, credit: "MT Agora" },
      inlineImage: {
        src: "/texto.jpg",
        alt: "Imagem do texto",
        kind: "reproduction" as const,
        credit: "Folha do Cerrado",
        position: 3,
      },
    };
    const { container } = render(<ArticleCard variant="standard" article={article} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("src", "/capa.jpg");
    expect(screen.queryByText(/Folha do Cerrado/)).not.toBeInTheDocument();
  });

  it("foto própria não ganha legenda de reprodução", () => {
    const article = {
      ...baseArticle,
      image: { src: "/f.jpg", alt: "Fumaça", kind: "original" as const },
    };
    render(<ArticleCard variant="standard" article={article} />);
    expect(screen.queryByText(/Reprodução web/)).not.toBeInTheDocument();
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

  it("TopicSummaryCard não mostra selo de estado (R16) e mantém as contagens", () => {
    const { container } = render(<TopicSummaryCard topic={topic} now={now} />);
    expect(screen.getByRole("link", { name: topic.title })).toHaveAttribute("href", topic.href);
    expect(container.textContent).not.toMatch(/Em apuração|Confirmado|Encerrado|confian/i);
    expect(container.querySelector("[data-state]")).toBeNull();
    expect(container.querySelector("[data-bar]")).toBeNull();
    expect(screen.getByText(/1 matéria · 4 fontes/)).toBeInTheDocument();
  });

  it("TopicSummaryCard mostra a foto da capa quando o assunto tem uma (R40) e sem ela segue sem foto", () => {
    const cover = { src: "/api/media/m1", alt: "Rio Cuiabá", kind: "original" as const };
    const { container, rerender } = render(
      <TopicSummaryCard topic={{ ...topic, cover }} now={now} />,
    );
    expect(screen.getByRole("img", { name: "Rio Cuiabá" })).toBeInTheDocument();
    rerender(<TopicSummaryCard topic={topic} now={now} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("TopicSummaryCard com capa de reprodução traz a legenda com a fonte", () => {
    const cover = {
      src: "/api/media/m2",
      alt: "Obra",
      kind: "reproduction" as const,
      credit: "Folha do Cerrado",
    };
    render(<TopicSummaryCard topic={{ ...topic, cover }} now={now} />);
    expect(screen.getByText(/Reprodução web · Folha do Cerrado/)).toBeInTheDocument();
  });

  it("TopicSummaryCard não mostra o selo Corrigido ao público (R34)", () => {
    render(<TopicSummaryCard topic={{ ...topic, state: "corrigido" }} now={now} />);
    expect(screen.queryByText("Corrigido")).toBeNull();
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

  it("NowList tem até 6 itens, sem texto de revisão, e próximo ciclo", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      ...baseArticle,
      id: `n${i}`,
      title: `Notícia ${i}`,
      href: `/materia/n${i}`,
    }));
    render(<NowList items={items} now={new Date("2026-09-27T18:12:00Z")} />);
    const region = screen.getByRole("region", { name: "Agora" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(6);
    expect(region.textContent).not.toMatch(/revisad|Marina Couto/i);
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

describe("SectionTile", () => {
  it("é link para a editoria com a contagem do dia em texto", () => {
    render(<SectionTile href="/cidade" name="Cidade" meta="3 matérias hoje" icon="house" />);
    expect(screen.getByRole("link", { name: "Cidade" })).toHaveAttribute("href", "/cidade");
    expect(screen.getByText("3 matérias hoje")).toBeInTheDocument();
  });
});

describe("compactOnMobile (só a home)", () => {
  it("sem a prop, descrição de coleção e de serviço não ganham classe de ocultação", () => {
    render(
      <>
        <CollectionCard
          collection={
            {
              id: "c",
              title: "Guia",
              description: "Descrição da coleção",
              itemCount: 2,
              href: "/colecoes/guia",
            } as never
          }
        />
        <ServiceTile href="/servicos" title="Vagas" description="Mutirão" icon="users" />
      </>,
    );
    expect(screen.getByText("Descrição da coleção").className).not.toMatch(/hidden/);
    expect(screen.getByText("Mutirão").className).not.toMatch(/hidden/);
  });

  it("com a prop, as descrições somem só no celular (max-sm)", () => {
    render(
      <>
        <CollectionCard
          compactOnMobile
          collection={
            {
              id: "c",
              title: "Guia",
              description: "Descrição da coleção",
              itemCount: 2,
              href: "/colecoes/guia",
            } as never
          }
        />
        <ServiceTile
          compactOnMobile
          href="/servicos"
          title="Vagas"
          description="Mutirão"
          icon="users"
        />
      </>,
    );
    expect(screen.getByText("Descrição da coleção").className).toMatch(/max-sm:hidden/);
    expect(screen.getByText("Mutirão").className).toMatch(/max-sm:hidden/);
  });
});
