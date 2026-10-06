import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DismissMenu,
  PopularSourcesRail,
  RecommendationReason,
  SourceCard,
  SourceRow,
  type SourceCardData,
} from "../index";

const now = new Date("2026-09-27T18:00:00Z");

const fixtureSource: SourceCardData = {
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  href: "/fontes/folha-do-cerrado",
  category: "Política",
  locality: "Cuiabá",
  reason: "Mais acessada em Cuiabá esta semana",
  reach: 18_342,
  trend: "stable",
  itemsToday: 42,
  updatedAt: "2026-09-27T17:48:00Z",
  verified: true,
  preferred: false,
  followed: false,
};

describe("SourceCard", () => {
  it("card enxuto: avatar, nome, categoria · local, uma justificativa, Seguir e Ver matérias", () => {
    const { container } = render(
      <SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />,
    );
    const card = screen.getByRole("article", { name: "Folha do Cerrado" });
    expect(container.querySelector("[class*='bg-avatar-']")).not.toBeNull();
    expect(within(card).getByText("Política · Cuiabá")).toBeInTheDocument();
    expect(within(card).getAllByText(/^Por que aparece aqui:/)).toHaveLength(1);
    expect(within(card).getByText("Mais acessada em Cuiabá esta semana")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Seguir Folha do Cerrado" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(card).getByRole("link", { name: "Ver matérias de Folha do Cerrado" }),
    ).toBeInTheDocument();
    // Sem botão "Ocultar" solto: ocultar vive no menu ⋯.
    expect(within(card).queryByRole("button", { name: /^Ocultar/ })).not.toBeInTheDocument();
    expect(within(card).queryByText("Ocultar")).not.toBeInTheDocument();
  });

  it("no celular é linha com divisória, não card; card só a partir de sm (DESIGN.md §6)", () => {
    const { container } = render(
      <SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />,
    );
    const card = screen.getByRole("article", { name: "Folha do Cerrado" });
    const cls = card.className.split(/\s+/);
    // Moldura de card (borda, raio, fundo, respiro interno) só a partir de sm.
    for (const c of ["border", "rounded-lg", "bg-card-white", "p-4"]) {
      expect(cls).not.toContain(c);
      expect(cls).toContain(`sm:${c}`);
    }
    expect(cls).toContain("border-b");
    // Avatar 40 no celular e 56 a partir de sm.
    const avatar = container.querySelector("[class*='bg-avatar-']");
    expect(avatar?.className).toMatch(/(^|\s)size-10(\s|$)/);
    expect(avatar?.className).toMatch(/sm:size-14/);
    // "Ver matérias" repete o link do nome: some no celular.
    expect(
      within(card).getByRole("link", { name: "Ver matérias de Folha do Cerrado" }).className,
    ).toMatch(/max-sm:hidden/);
  });

  it("estatísticas e selos ficam dentro de <details> 'Detalhes', fechado por padrão", () => {
    const { container } = render(
      <SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector("summary")?.textContent).toMatch(/^Detalhes/);
    expect(details?.querySelector("summary")?.className).toMatch(/min-h-tap/);
    for (const t of ["~18 mil", "estável", "42 hoje", "há 12 min"])
      expect(details).toContainElement(screen.getByText(new RegExp(t)));
    for (const b of screen.getAllByTestId("source-badge")) expect(details).toContainElement(b);
  });

  it("menu ⋯ com nome acessível oculta com motivo; Esc fecha e devolve o foco", async () => {
    const onHide = vi.fn();
    render(<SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={onHide} now={now} />);
    const more = screen.getByRole("button", { name: "Mais opções de Folha do Cerrado" });
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    expect(more.className).toMatch(/size-tap/);
    more.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Por que ocultar Folha do Cerrado?" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("menuitem", { name: "Não tenho interesse" }));
    expect(onHide).toHaveBeenCalledWith("folha-do-cerrado", "not_interested");
  });

  it("nunca mostra contagem exata de leitores", () => {
    const { container } = render(
      <SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />,
    );
    expect(container.textContent).not.toMatch(/18\.?342/);
  });

  it("nome é link para a página da fonte e 'Ver matérias' também", () => {
    render(<SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />);
    expect(screen.getByRole("link", { name: "Folha do Cerrado" })).toHaveAttribute(
      "href",
      "/fontes/folha-do-cerrado",
    );
    expect(screen.getByRole("link", { name: "Ver matérias de Folha do Cerrado" })).toHaveAttribute(
      "href",
      "/fontes/folha-do-cerrado",
    );
  });

  it("selos em plaqueta de contorno, sem 'melhor', 'top' ou estrelas", () => {
    const { container } = render(
      <SourceCard
        source={{ ...fixtureSource, preferred: true }}
        onFollow={vi.fn()}
        onHide={vi.fn()}
        now={now}
      />,
    );
    const badges = screen.getAllByTestId("source-badge");
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.textContent)).toEqual(["PREFERIDA", "VERIFICADA"]);
    for (const b of badges) expect(b.className).toMatch(/\bborder\b/);
    expect(container.textContent).not.toMatch(/melhor|\btop\b|★|☆|estrela/i);
  });

  it("sem logotipo usa monograma de 2 letras sobre cor de avatar", () => {
    const { container } = render(
      <SourceCard source={fixtureSource} onFollow={vi.fn()} onHide={vi.fn()} now={now} />,
    );
    const mono = container.querySelector("[class*='bg-avatar-']");
    expect(mono?.textContent).toBe("FC");
  });

  it("seguir chama onFollow com o próximo estado; seguida mostra 'Seguindo'", async () => {
    const onFollow = vi.fn();
    const { rerender } = render(
      <SourceCard source={fixtureSource} onFollow={onFollow} onHide={vi.fn()} now={now} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Seguir Folha do Cerrado" }));
    expect(onFollow).toHaveBeenCalledWith("folha-do-cerrado", true);
    rerender(
      <SourceCard
        source={{ ...fixtureSource, followed: true }}
        onFollow={onFollow}
        onHide={vi.fn()}
        now={now}
      />,
    );
    const btn = screen.getByRole("button", { name: "Seguir Folha do Cerrado" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent("Seguindo");
  });

  it("tendência subindo e caindo com texto, não só ícone", () => {
    const { rerender } = render(
      <SourceCard
        source={{ ...fixtureSource, trend: "up" }}
        onFollow={vi.fn()}
        onHide={vi.fn()}
        now={now}
      />,
    );
    expect(screen.getByText(/subindo/)).toBeInTheDocument();
    rerender(
      <SourceCard
        source={{ ...fixtureSource, trend: "down" }}
        onFollow={vi.fn()}
        onHide={vi.fn()}
        now={now}
      />,
    );
    expect(screen.getByText(/caindo/)).toBeInTheDocument();
  });
});

describe("DismissMenu", () => {
  it("ocultar pede motivo com as 4 opções, num menu ⋯ com legenda visível", async () => {
    render(<DismissMenu onChoose={vi.fn()} sourceName="MT Agora" />);
    const trigger = screen.getByRole("button", { name: "Mais opções de MT Agora" });
    expect(trigger.textContent).toBe("");
    await userEvent.click(trigger);
    expect(screen.getByText("Ocultar esta fonte")).toBeVisible();
    for (const t of [
      "Não tenho interesse",
      "Já conheço esta fonte",
      "Não quero ver este tema",
      "Não quero recomendações personalizadas",
    ])
      expect(screen.getByRole("menuitem", { name: t })).toBeInTheDocument();
  });

  it("escolher um motivo chama onChoose, fecha e devolve o foco", async () => {
    const onChoose = vi.fn();
    render(<DismissMenu onChoose={onChoose} sourceName="MT Agora" />);
    const trigger = screen.getByRole("button", { name: "Mais opções de MT Agora" });
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Não quero recomendações personalizadas" }),
    );
    expect(onChoose).toHaveBeenCalledWith("no_personalization");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("teclado: abre com foco no primeiro item, setas navegam, Esc fecha", async () => {
    render(<DismissMenu onChoose={vi.fn()} sourceName="MT Agora" />);
    const trigger = screen.getByRole("button", { name: "Mais opções de MT Agora" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Não tenho interesse" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Já conheço esta fonte" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(
      screen.getByRole("menuitem", { name: "Não quero recomendações personalizadas" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("clique fora fecha sem escolher", async () => {
    const onChoose = vi.fn();
    render(
      <div>
        <p>fora</p>
        <DismissMenu onChoose={onChoose} sourceName="MT Agora" />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mais opções de MT Agora" }));
    await userEvent.click(screen.getByText("fora"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe("SourceRow", () => {
  it("avatar, nome, justificativa em Azul IA, Seguir de 44 px e ocultar pelo menu ⋯", async () => {
    const onHide = vi.fn();
    render(
      <ul>
        <SourceRow source={fixtureSource} onFollow={vi.fn()} onHide={onHide} />
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(within(row).getByRole("link", { name: "Folha do Cerrado" })).toBeInTheDocument();
    expect(within(row).getByText("Mais acessada em Cuiabá esta semana").className).toMatch(
      /text-ai/,
    );
    expect(within(row).getByRole("button", { name: "Seguir Folha do Cerrado" }).className).toMatch(
      /h-tap/,
    );
    await userEvent.click(
      within(row).getByRole("button", { name: "Mais opções de Folha do Cerrado" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Já conheço esta fonte" }));
    expect(onHide).toHaveBeenCalledWith("folha-do-cerrado", "already_know");
  });
});

describe("PopularSourcesRail", () => {
  it("fileira com título, avatares com link e rolagem com snap", () => {
    render(
      <PopularSourcesRail
        title="Mais acessadas em Cuiabá"
        sources={[
          { slug: "folha-do-cerrado", name: "Folha do Cerrado", href: "/fontes/folha-do-cerrado" },
          { slug: "mt-agora", name: "MT Agora", href: "/fontes/mt-agora" },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Mais acessadas em Cuiabá" })).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(list.className).toMatch(/snap-x/);
    expect(
      within(list)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/fontes/folha-do-cerrado", "/fontes/mt-agora"]);
  });

  it("vazia não renderiza nada", () => {
    const { container } = render(<PopularSourcesRail title="Mais acessadas" sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RecommendationReason", () => {
  it("texto em Azul IA", () => {
    render(<RecommendationReason text="Popular em Cuiabá" />);
    expect(screen.getByText("Popular em Cuiabá").className).toMatch(/text-ai/);
  });
});
