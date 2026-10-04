import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountInvite, AccountShell, DocPage, PageHeader } from "../index";

/*
 * UI-T14: conta, favoritos, alertas e páginas legais no mesmo grid e escala do portal, com
 * convite de conta que sempre oferece "Agora não" (CLAUDE.md §5 regra 2).
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const SECTIONS = [
  { title: "Quem somos", paragraphs: ["Texto um."] },
  { title: "Dados que coletamos", items: ["Item a", "Item b"] },
  { title: "Seus direitos", paragraphs: ["Texto três."] },
];

describe("PageHeader", () => {
  it("usa o título de tela do portal (não o display) e medida de leitura no texto", () => {
    render(<PageHeader title="Favoritos" intro="O que você guardou." />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Favoritos" });
    expect(h1).toHaveClass("type-screen-title");
    expect(h1).not.toHaveClass("type-display");
    expect(screen.getByText("O que você guardou.").closest(".max-w-read")).not.toBeNull();
  });
});

describe("DocPage", () => {
  it("fica no contêiner da página com coluna de leitura de 68ch", () => {
    const { container } = render(
      <DocPage title="Termos de uso" intro="Intro" sections={SECTIONS} path="/termos" />,
    );
    expect(container.firstElementChild).toHaveClass("max-w-page", "px-gutter");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("type-screen-title");
    const body = screen.getByTestId("doc-body");
    expect(body).toHaveClass("max-w-read");
    expect(within(body).getByRole("heading", { name: "Seus direitos" })).toBeInTheDocument();
  });

  it("com 3 seções ou mais, mostra 'Nesta página' com âncoras para cada seção", () => {
    render(<DocPage title="Termos de uso" intro="Intro" sections={SECTIONS} path="/termos" />);
    const toc = screen.getByRole("navigation", { name: "Nesta página" });
    const link = within(toc).getByRole("link", { name: "Dados que coletamos" });
    const id = link.getAttribute("href")!.slice(1);
    expect(document.getElementById(id)).toHaveTextContent("Dados que coletamos");
    for (const a of within(toc).getAllByRole("link")) expect(a).toHaveClass("min-h-tap");
  });

  it("com poucas seções, não mostra índice", () => {
    render(<DocPage title="T" intro="I" sections={SECTIONS.slice(0, 2)} path="/termos" />);
    expect(screen.queryByRole("navigation", { name: "Nesta página" })).toBeNull();
  });

  it("não leva a páginas ocultas pelo dono (R34) nem mostra a sigla nos links", () => {
    render(<DocPage title="T" intro="I" sections={SECTIONS} path="/privacidade" />);
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href")).not.toMatch(/como-usamos-ia|metodologia/);
      expect(a.textContent).not.toMatch(/\bIA\b/);
    }
  });
});

describe("AccountShell", () => {
  it("fica no contêiner da página e sempre oferece seguir sem conta", () => {
    const { container } = render(
      <AccountShell title="Recuperar senha" intro="Digite o e-mail.">
        <p>form</p>
      </AccountShell>,
    );
    expect(container.firstElementChild).toHaveClass("max-w-page", "px-gutter");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("type-screen-title");
    expect(screen.getByRole("link", { name: "Continuar sem login" })).toHaveAttribute("href", "/");
  });

  it("com benefícios (UI-T12) mantém a saída 'Continuar sem entrar' e a lista", () => {
    render(
      <AccountShell title="Entrar na conta" benefits>
        <p>form</p>
      </AccountShell>,
    );
    expect(screen.getByRole("link", { name: "Continuar sem entrar" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "O que a conta guarda para você" })).toBeVisible();
  });
});

describe("AccountInvite", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "sb-x-auth-token=; max-age=0; path=/";
  });

  it("explica por que criar conta, com benefícios, Criar conta, Entrar e Agora não", () => {
    render(<AccountInvite next="/favoritos" />);
    const region = screen.getByRole("region", { name: "Por que criar uma conta" });
    const benefits = within(region).getByRole("list", { name: "O que a conta guarda para você" });
    expect(within(benefits).getAllByRole("listitem")).toHaveLength(3);
    expect(within(region).getByText(/Opcional/)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/criar-conta?next=%2Ffavoritos",
    );
    expect(within(region).getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/entrar?next=%2Ffavoritos",
    );
    expect(within(region).getByRole("button", { name: "Agora não" })).toBeInTheDocument();
  });

  it("aceita o rótulo do botão principal (perfil: Criar conta para sincronizar)", () => {
    render(<AccountInvite next="/perfil" createLabel="Criar conta para sincronizar" />);
    expect(screen.getByRole("link", { name: "Criar conta para sincronizar" })).toHaveAttribute(
      "href",
      "/criar-conta?next=%2Fperfil",
    );
  });

  it("'Agora não' recolhe o convite, anuncia, move o foco e lembra a escolha", async () => {
    const { unmount } = render(<AccountInvite next="/alertas" />);
    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("button", { name: "Agora não" })).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Tudo bem: você continua sem conta.");
    expect(status).toHaveFocus();
    // Quem mudar de ideia ainda acha a saída, numa linha discreta.
    expect(within(status).getByRole("link", { name: "Criar conta" })).toBeInTheDocument();
    unmount();
    render(<AccountInvite next="/alertas" />);
    expect(screen.queryByRole("region", { name: "Por que criar uma conta" })).toBeNull();
  });

  it("some para quem já entrou", () => {
    document.cookie = "sb-x-auth-token=abc; path=/";
    const { container } = render(<AccountInvite next="/favoritos" />);
    expect(container).toBeEmptyDOMElement();
  });
});
