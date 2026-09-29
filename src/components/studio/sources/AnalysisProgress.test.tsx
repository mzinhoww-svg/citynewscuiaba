import { render, screen } from "@testing-library/react";
import type { LinkAnalysisFresh } from "@/lib/sources/analyze";
import { AnalysisProgress } from "./AnalysisProgress";

const analysis = {
  url: "https://vozdocoxipo.example/",
  duplicate: null,
  discovery: {
    strategy: "rss",
    kind: "rss",
    finalUrl: "https://vozdocoxipo.example/",
    feedUrl: "https://vozdocoxipo.example/feed",
    tried: [],
    robots: { allowed: true, crawlDelaySec: null },
  },
  preview: {
    finalUrl: "https://vozdocoxipo.example/",
    siteName: "Voz do Coxipó",
    description: null,
    strategy: "rss",
    feedUrl: "https://vozdocoxipo.example/feed",
    items: Array.from({ length: 10 }, (_, i) => ({
      title: `Item ${i}`,
      url: `https://vozdocoxipo.example/n/${i}`,
      publishedAt: null,
    })),
    droppedForInjection: 0,
    termsLinks: [],
  },
  termsLinks: [],
  rules: {},
  ai: null,
  aiStatus: "ok",
  selectorsValidated: false,
  discoveryId: null,
} as unknown as LinkAnalysisFresh;

describe("AnalysisProgress", () => {
  it("não mostra nada em repouso", () => {
    const { container } = render(<AnalysisProgress phase="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("anuncia a análise em andamento em região polite", () => {
    render(<AnalysisProgress phase="running" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Analisando o endereço");
  });

  it("resume cada etapa com o resultado", () => {
    render(<AnalysisProgress phase="done" analysis={analysis} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Lendo robots.txt… ok");
    expect(status).toHaveTextContent("Procurando feed… encontrado RSS em /feed");
    expect(status).toHaveTextContent("Testando a conexão… 10 itens");
    expect(status).toHaveTextContent("Sugestões da IA… prontas");
  });
});
