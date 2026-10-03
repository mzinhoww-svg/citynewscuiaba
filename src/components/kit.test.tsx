import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  AgendaList,
  ArticleActionBar,
  BarChart,
  BottomSheet,
  Button,
  CategoryTag,
  Chip,
  ChipGroup,
  Dialog,
  FeatureCard,
  Icon,
  IconButton,
  ListRow,
  LiveIndicator,
  MetaRow,
  NavHeader,
  NewsCard,
  Photo,
  SearchBar,
  SectionHeader,
  SegmentedToggle,
  SiteHeader,
  Slider,
  SourceAvatar,
  StatCard,
  StoryCard,
  TabBar,
  Tabs,
  TextField,
  Toggle,
  TopicCard,
  VideoLowerThird,
} from "./index";

describe("plano P0-T9b", () => {
  it("NewsCard é link navegável por teclado", () => {
    render(
      <NewsCard
        href="/materia/x"
        title="Obras na Av. do CPA mudam o trânsito"
        author="Ana Lima"
        time="há 12 min"
        sources={3}
      />,
    );
    expect(screen.getByRole("link", { name: /Obras na Av. do CPA/ })).toHaveAttribute(
      "href",
      "/materia/x",
    );
  });
  it("MetaRow não exibe comentários", () => {
    render(<MetaRow author="Ana Lima" time="há 12 min" sources={3} readMinutes={4} />);
    expect(screen.queryByText(/coment/i)).toBeNull();
    expect(screen.getByText("3 fontes")).toBeInTheDocument();
  });
  it("mostrar senha é botão com nome acessível", async () => {
    render(<TextField id="s" label="Senha" type="password" />);
    const b = screen.getByRole("button", { name: "Mostrar senha" });
    await userEvent.click(b);
    expect(b).toHaveAttribute("aria-pressed", "true");
  });
  it("campo tem borda de controle visível", () => {
    render(<TextField id="e" label="E-mail" />);
    expect(screen.getByLabelText("E-mail").parentElement).toHaveClass("border-control");
  });
  it("TabBar tem 5 destinos", () => {
    render(<TabBar active="home" />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });
});

describe("ações e ícones", () => {
  it("Icon é decorativo", () => {
    const { container } = render(<Icon name="search" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).toHaveAttribute("stroke-width", "1.5");
  });
  it("Button desabilitado não dispara clique", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Entrar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("Button com href vira link", () => {
    render(<Button href="/agenda">Ver agenda</Button>);
    expect(screen.getByRole("link", { name: "Ver agenda" })).toHaveAttribute("href", "/agenda");
  });
  it("IconButton exige nome e mostra o ponto de não lido só como adorno", () => {
    render(<IconButton icon="bell" label="Notificações" badge />);
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });
});

describe("formulários", () => {
  it("TextField liga dica e erro por aria-describedby", () => {
    render(
      <TextField
        id="mail"
        label="E-mail"
        hint="Use o e-mail da conta"
        error="E-mail inválido. Exemplo: ana@exemplo.com"
      />,
    );
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Use o e-mail da conta.*E-mail inválido/);
  });
  it("TextField sem erro não é inválido", () => {
    render(<TextField id="n" label="Nome" hint="Como aparece no Estúdio" />);
    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Nome")).toHaveAccessibleDescription("Como aparece no Estúdio");
  });
  it("SearchBar é um formulário de busca com rótulo e botão de filtros", async () => {
    const onFilter = vi.fn();
    render(<SearchBar onFilter={onFilter} />);
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(onFilter).toHaveBeenCalled();
  });
  it("Toggle é switch com estado", async () => {
    const onChange = vi.fn();
    render(<Toggle label="Notificações" onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Notificações" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("Slider é range nativo com passos", () => {
    render(<Slider label="Tamanho do texto" steps={7} defaultValue={50} />);
    const range = screen.getByRole("slider", { name: "Tamanho do texto" });
    expect(range).toHaveAttribute("step", String(100 / 6));
  });
  it("SegmentedToggle marca a opção escolhida", async () => {
    render(
      <SegmentedToggle
        label="Tema"
        options={[
          { value: "light", label: "Claro", icon: "sun" },
          { value: "dark", label: "Escuro", icon: "moon" },
        ]}
      />,
    );
    const dark = screen.getByRole("radio", { name: "Escuro" });
    await userEvent.click(dark);
    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Claro" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("navegação", () => {
  it("Chip alterna com aria-pressed e ChipGroup controla a seleção", async () => {
    render(<ChipGroup label="Editorias" items={["Tudo", "Cidade"]} defaultValue="Tudo" />);
    const cidade = screen.getByRole("button", { name: "Cidade" });
    await userEvent.click(cidade);
    expect(cidade).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tudo" })).toHaveAttribute("aria-pressed", "false");
  });
  it("Chip com href é link", () => {
    render(<Chip href="/cidade">Cidade</Chip>);
    expect(screen.getByRole("link", { name: "Cidade" })).toBeInTheDocument();
  });
  it("Tabs usam tablist e setas", async () => {
    render(<Tabs label="Resultados" items={["Matérias", "Temas", "Autores"]} />);
    const first = screen.getByRole("tab", { name: "Matérias" });
    expect(first).toHaveAttribute("aria-selected", "true");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Temas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Temas" })).toHaveFocus();
  });
  it("TabBar marca o destino atual", () => {
    render(<TabBar active="favorites" />);
    expect(screen.getByRole("link", { name: "Favoritos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
  });
  it("NavHeader tem voltar com nome e título", () => {
    render(<NavHeader title="Buscar" backHref="/" />);
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Buscar")).toBeInTheDocument();
  });
  it("SectionHeader é h2 com ação em link", () => {
    render(<SectionHeader title="Mais lidas" actionHref="/mais-lidas" />);
    expect(screen.getByRole("heading", { level: 2, name: "Mais lidas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver tudo/ })).toHaveAttribute("href", "/mais-lidas");
  });
  it("SiteHeader marca o item ativo", () => {
    render(<SiteHeader active="agenda" />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("notícias", () => {
  it("FeatureCard e StoryCard são links e não mostram comentários", () => {
    render(
      <>
        <FeatureCard
          href="/materia/a"
          title="Prefeitura anuncia corredor"
          category="Cidade"
          time="5 h"
        />
        <StoryCard
          href="/materia/b"
          title="Câmara aprova plano diretor"
          author="Rafael Souza"
          time="5 h"
          saved={false}
          onToggleSave={() => {}}
        />
      </>,
    );
    expect(screen.getByRole("link", { name: "Prefeitura anuncia corredor" })).toHaveAttribute(
      "href",
      "/materia/a",
    );
    expect(screen.getByRole("link", { name: "Câmara aprova plano diretor" })).toHaveAttribute(
      "href",
      "/materia/b",
    );
    expect(screen.queryByText(/coment/i)).toBeNull();
  });
  it("StoryCard salva com botão alternável fora do link", async () => {
    const onToggleSave = vi.fn();
    render(<StoryCard href="/m" title="Título" saved={false} onToggleSave={onToggleSave} />);
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(save);
    expect(onToggleSave).toHaveBeenCalled();
  });
  it("NewsCard com mais opções tem botão nomeado", () => {
    render(<NewsCard href="/m" title="Título" onMore={() => {}} />);
    expect(screen.getByRole("button", { name: "Mais opções" })).toBeInTheDocument();
  });
  it("Photo sem src mostra o marcador e é decorativa sem alt", () => {
    render(<Photo label="Foto da reportagem" />);
    expect(screen.getByText("Foto da reportagem")).toHaveAttribute("aria-hidden", "true");
    render(<Photo alt="Avenida do CPA com obras" />);
    expect(screen.getByRole("img", { name: "Avenida do CPA com obras" })).toBeInTheDocument();
  });
  it("CategoryTag e LiveIndicator mostram texto", () => {
    render(
      <>
        <CategoryTag>Cidade</CategoryTag>
        <LiveIndicator />
      </>,
    );
    expect(screen.getByText("Cidade")).toBeInTheDocument();
    expect(screen.getByText("Agora")).toBeInTheDocument();
  });
  it("MetaRow mostra a origem em frase, sem texto de revisão (LAB-T1)", () => {
    const { container } = render(
      <MetaRow originText="Feito a partir de 2 fontes" sponsoredText="Patrocinado" time="8h05" />,
    );
    expect(container.textContent).toBe("Feito a partir de 2 fontes·Patrocinado·8h05");
    expect(container.textContent).not.toMatch(/revisad/i);
  });

  it("MetaRow mostra só o que recebeu, com separador decorativo", () => {
    const { container } = render(<MetaRow time="há 5 min" />);
    expect(container.textContent).toBe("há 5 min");
  });
});

describe("descoberta e listas", () => {
  it("TopicCard alterna Seguir/Seguindo", async () => {
    render(<TopicCard label="Mobilidade" icon="map-pin" />);
    const b = screen.getByRole("button", { name: "Seguir Mobilidade" });
    await userEvent.click(b);
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(b).toHaveTextContent("Seguindo");
  });
  it("SourceAvatar sem imagem mostra monograma e nome", () => {
    render(<SourceAvatar name="Folha do Cerrado" href="/fontes/folha-do-cerrado" />);
    expect(screen.getByRole("link", { name: "Folha do Cerrado" })).toBeInTheDocument();
    expect(screen.getByText("FC")).toHaveAttribute("aria-hidden", "true");
  });
  it("AgendaList é lista", () => {
    render(
      <AgendaList
        title="Agenda de hoje"
        items={[{ when: "19h", title: "Show no Sesc Arsenal", place: "Centro" }]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  it("StatCard diz a tendência em texto, não só em cor", () => {
    render(<StatCard icon="eye" label="Visualizações" value="213 mil" delta="-2%" trend="down" />);
    expect(screen.getByText(/queda/)).toBeInTheDocument();
  });
  it("BarChart tem resumo textual", () => {
    render(<BarChart label="Leituras por hora" values={[1, 2, 3]} labels={["0h", "12h", "24h"]} />);
    expect(screen.getByRole("img", { name: "Leituras por hora" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("ListRow clicável é botão; com href é link", () => {
    render(
      <>
        <ListRow label="Idioma" value="Português" onClick={() => {}} />
        <ListRow label="Privacidade" href="/privacidade" />
      </>,
    );
    expect(screen.getByRole("button", { name: /Idioma/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Privacidade/ })).toBeInTheDocument();
  });
  it("ArticleActionBar tem as 5 ações de R8, sem curtidas nem comentários", async () => {
    const onUseful = vi.fn();
    render(<ArticleActionBar saved useful={false} onUseful={onUseful} />);
    const group = screen.getByRole("toolbar", { name: "Ações da matéria" });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual([
      "Salvar",
      "Compartilhar",
      "Ajustar leitura",
      "Útil",
      "Informar problema",
    ]);
    expect(within(group).getByRole("button", { name: "Salvar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(group).getByRole("button", { name: "Útil" }));
    expect(onUseful).toHaveBeenCalled();
    expect(screen.queryByText(/curtid|coment/i)).toBeNull();
  });
});

describe("sobreposições e marca", () => {
  it("Dialog inline tem nome e fecha pelo botão", async () => {
    const onClose = vi.fn();
    render(<Dialog inline title="Tem certeza de que deseja sair?" onClose={onClose} />);
    expect(
      screen.getByRole("dialog", { name: "Tem certeza de que deseja sair?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("Dialog fechado não renderiza", () => {
    render(<Dialog open={false} title="Oculto" />);
    expect(screen.queryByText("Oculto")).toBeNull();
  });
  it("BottomSheet inline tem título", () => {
    render(
      <BottomSheet inline title="Exibição">
        Conteúdo
      </BottomSheet>,
    );
    expect(screen.getByRole("dialog", { name: "Exibição" })).toBeInTheDocument();
  });
  it("VideoLowerThird mostra o chapéu ao vivo e a manchete", () => {
    render(<VideoLowerThird headline="Chuva forte alaga trecho da Av. Miguel Sutil" />);
    expect(screen.getByText("Chuva forte alaga trecho da Av. Miguel Sutil")).toBeInTheDocument();
  });
});
