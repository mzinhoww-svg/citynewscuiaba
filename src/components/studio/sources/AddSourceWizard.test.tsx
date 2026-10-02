import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LinkAnalysis } from "@/lib/sources/analyze";
import { AddSourceWizard, type WizardAction } from "./AddSourceWizard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const SECTIONS = [
  { slug: "cidade", name: "Cidade" },
  { slug: "politica", name: "Política" },
];

function analysis(over: Partial<LinkAnalysis> = {}): LinkAnalysis {
  const items = Array.from({ length: 10 }, (_, i) => ({
    title: `Notícia ${i + 1} do Coxipó`,
    url: `https://vozdocoxipo.example/noticia-${i + 1}`,
    publishedAt: i === 3 ? null : `2026-09-2${(i % 7) + 1}T12:00:00Z`,
  }));
  return {
    status: "analyzed",
    url: "https://vozdocoxipo.example/",
    duplicate: null,
    discovery: {
      strategy: "rss",
      kind: "rss",
      feedUrl: "https://vozdocoxipo.example/feed",
      tried: [
        { url: "https://vozdocoxipo.example/", outcome: "página sem feed anunciado" },
        { url: "https://vozdocoxipo.example/feed", outcome: "ok" },
      ],
      robots: { allowed: true, crawlDelaySec: null },
      baseUrl: "https://vozdocoxipo.example/",
    },
    preview: {
      finalUrl: "https://vozdocoxipo.example/",
      siteName: "Voz do Coxipó",
      description: null,
      strategy: "rss",
      feedUrl: "https://vozdocoxipo.example/feed",
      items,
      droppedForInjection: 1,
      termsLinks: ["https://vozdocoxipo.example/termos"],
    },
    termsLinks: ["https://vozdocoxipo.example/termos"],
    rules: {
      name: { value: "Voz do Coxipó", origin: "regra" },
      slug: { value: "voz-do-coxipo", origin: "regra" },
      frequency: { value: 60, origin: "regra" },
      reliability: { value: "standard", origin: "regra" },
      layer: { value: 2, origin: "regra" },
      rateLimitPerHour: { value: 20, origin: "regra" },
    },
    ai: {
      categories: { value: ["cidade"], origin: "ia", confidence: 0.8 },
      locality: { value: "cuiaba", origin: "ia", confidence: 0.8 },
      qualityFlags: { value: ["sem_data"], origin: "ia", confidence: 0.8 },
      pageSelectors: { value: null, origin: "ia", confidence: 0.8 },
      rationale: { value: "Portal de bairro.", origin: "ia", confidence: 0.8 },
    },
    aiStatus: "ok",
    selectorsValidated: false,
    consumption: {
      strategy: "rss",
      feedUrl: "https://vozdocoxipo.example/feed",
      pageSelectors: null,
      discovery: { at: "2026-09-28T12:00:00Z", by: "auto", inputUrl: "x", tried: 2 },
      robots: { checkedAt: "2026-09-28T12:00:00Z", allowed: true, crawlDelaySec: null },
      cadence: { itemsPerDay: 6, medianGapMinutes: 120, sampledAt: "2026-09-28T12:00:00Z" },
    },
    discoveryId: "d0000000-0000-4000-8000-000000000001",
    ...over,
  };
}

function setup(analyze: WizardAction, create: WizardAction = vi.fn()) {
  render(
    <AddSourceWizard analyze={analyze} create={create} sections={SECTIONS} defaultFrequency={30} />,
  );
}

async function analyzeUrl(url = "https://vozdocoxipo.example/") {
  await userEvent.type(screen.getByLabelText("Endereço da fonte"), url);
  await userEvent.click(screen.getByRole("button", { name: "Analisar" }));
}

describe("AddSourceWizard", () => {
  beforeEach(() => push.mockReset());

  it("etapas com aria-current e progresso em aria-live", async () => {
    setup(async () => ({ ok: true, message: "Análise concluída", data: analysis() }));
    const steps = screen.getByRole("list", { name: "Etapas do cadastro" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(within(steps).getByText("Endereço").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await analyzeUrl();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Lendo robots.txt… ok");
    expect(status).toHaveTextContent("encontrado RSS em /feed");
    expect(status).toHaveTextContent("Testando… 10 itens");
    expect(status).toHaveTextContent("1 item descartado por conter instruções");
    expect(within(steps).getByText("Revisão").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("prévia só com texto e links externos seguros; políticas no padrão restrito", async () => {
    setup(async () => ({ ok: true, message: "ok", data: analysis() }));
    await analyzeUrl();
    const list = screen.getByRole("list", { name: "Prévia dos últimos itens" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    const link = within(items[0]!).getByRole("link");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(list.querySelector("img")).toBeNull();
    expect(within(items[3]!).getByText("sem data")).toBeInTheDocument();
    expect(screen.getByLabelText("Política de imagem")).toHaveValue("none");
    expect(screen.getByLabelText("Política de republicação")).toHaveValue("link_only");
    expect(screen.getByLabelText("Pode ser fonte única")).not.toBeChecked();
    // Frequência pela cadência (regra) já vem aplicada; via rápida nunca é oferecida no cadastro.
    const freq = screen.getByLabelText("Frequência de coleta");
    expect(freq).toHaveValue("60");
    expect(within(freq).queryByRole("option", { name: "10 min" })).toBeNull();
    // Nada da IA sem clique.
    expect(screen.getByLabelText("Editorias")).toHaveValue("");
    expect(screen.getByText("Itens sem data")).toBeInTheDocument();
  });

  it("salva pausada com o que veio de sugestão e navega ao detalhe", async () => {
    const create = vi.fn<WizardAction>(async () => ({
      ok: true,
      message: "Fonte salva pausada.",
      data: { id: "abc", version: 2 },
    }));
    setup(async () => ({ ok: true, message: "ok", data: analysis() }), create);
    await analyzeUrl();
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão da IA para Editorias" }),
    );
    await userEvent.click(screen.getByLabelText("Li os termos de uso e a coleta é permitida"));
    await userEvent.click(screen.getByRole("button", { name: "Salvar pausada" }));
    expect(create).toHaveBeenCalledTimes(1);
    const form = create.mock.calls[0]![0];
    expect(form.get("name")).toBe("Voz do Coxipó");
    expect(form.get("categories")).toBe("cidade");
    expect(form.get("imagePolicy")).toBe("none");
    expect(form.get("termsReviewed")).toBe("1");
    expect(form.get("activate")).toBeNull();
    expect(form.get("discoveryId")).toBe("d0000000-0000-4000-8000-000000000001");
    expect(form.get("strategy")).toBe("rss");
    expect(form.get("feedUrl")).toBe("https://vozdocoxipo.example/feed");
    expect(form.getAll("acceptedFields")).toContain("categories");
    expect(form.getAll("acceptedFields")).not.toContain("locality");
    expect(push).toHaveBeenCalledWith("/estudio/control/fontes/abc?cadastro=pausada");
  });

  it("afrouxar política no cadastro pede justificativa e marca a segunda aprovação", async () => {
    setup(async () => ({ ok: true, message: "ok", data: analysis() }));
    await analyzeUrl();
    expect(screen.queryByLabelText(/Justificativa/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Política de imagem"), "reproduction");
    expect(screen.getAllByText("Exige segunda aprovação").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Justificativa para a segunda aprovação")).toBeInTheDocument();
  });

  it("robots que proíbe: mensagem com host e caminho; texto digitado é mantido", async () => {
    setup(async () => ({
      ok: false,
      message:
        "O robots.txt de proibido.example não permite a coleta de /. A fonte não pode ser cadastrada para coleta.",
      fieldErrors: { url: "x" },
    }));
    await analyzeUrl("https://proibido.example/");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O robots.txt de proibido.example não permite a coleta de /.",
    );
    expect(screen.getByLabelText("Endereço da fonte")).toHaveValue("https://proibido.example/");
    expect(screen.queryByRole("list", { name: "Prévia dos últimos itens" })).toBeNull();
  });

  it("duplicada: aponta a fonte existente com link", async () => {
    setup(async () => ({
      ok: true,
      message: "Esta fonte já está cadastrada: Folha do Cerrado",
      data: {
        status: "duplicate",
        url: "https://folhadocerrado.example/",
        duplicate: {
          id: "c5000000-0000-4000-8000-000000000001",
          name: "Folha do Cerrado",
          archived: false,
        },
      },
    }));
    await analyzeUrl("https://folhadocerrado.example/");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Esta fonte já está cadastrada: Folha do Cerrado",
    );
    expect(screen.getByRole("link", { name: "Abrir Folha do Cerrado" })).toHaveAttribute(
      "href",
      "/estudio/control/fontes/c5000000-0000-4000-8000-000000000001",
    );
  });

  it("IA indisponível: aviso e o fluxo segue", async () => {
    setup(async () => ({
      ok: true,
      message: "ok",
      data: analysis({ ai: null, aiStatus: "unavailable" }),
    }));
    await analyzeUrl();
    expect(
      screen.getByText("Sugestões da IA indisponíveis agora. Preencha os campos manualmente."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Usar sugestão da IA/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Salvar pausada" })).toBeEnabled();
  });
});
