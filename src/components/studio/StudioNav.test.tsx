import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioNav, StudioNavSearch } from "./StudioNav";
import type { StudioNavGroup } from "./StudioShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/estudio/control/falhas" }));

const NAV: StudioNavGroup[] = [
  {
    label: "Redação",
    items: [
      { href: "/estudio", label: "Redação", icon: "layout-dashboard", exact: true },
      { href: "/estudio/fila", label: "Exceções", icon: "newspaper", count: 3 },
      {
        href: "/estudio/denuncias",
        label: "Denúncias",
        icon: "flag",
        count: 2,
        countKind: "overdue",
      },
    ],
  },
  {
    label: "Control Center",
    items: [
      {
        href: "/estudio/admin/contingencia",
        label: "Contingência",
        icon: "triangle-alert",
        emphasis: true,
      },
      {
        href: "/estudio/control",
        label: "Visão geral",
        icon: "gauge",
        exact: true,
        subgroup: "Operação",
      },
      {
        href: "/estudio/control/logs",
        label: "Registros",
        icon: "scroll-text",
        subgroup: "Operação",
      },
      {
        href: "/estudio/control/falhas",
        label: "Falhas",
        icon: "circle-alert",
        subgroup: "Operação",
      },
      { href: "/estudio/control/testes", label: "Testar prompts", icon: "play", subgroup: "IA" },
    ],
  },
];

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("StudioNav", () => {
  it("mostra a contagem em texto ao lado do rótulo, com nome acessível completo", () => {
    render(<StudioNav nav={NAV} />);
    const link = screen.getByRole("link", { name: "Exceções, 3 pendentes" });
    expect(link).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Denúncias, 2 vencidas" })).toBeInTheDocument();
    // Sem contagem, o nome é só o rótulo.
    expect(screen.getByRole("link", { name: "Registros" })).toBeInTheDocument();
  });

  it("separa o Control Center em subgrupos com título", () => {
    render(<StudioNav nav={NAV} />);
    const op = screen.getByRole("group", { name: "Operação" });
    expect(within(op).getByRole("link", { name: "Registros" })).toBeInTheDocument();
    const ia = screen.getByRole("group", { name: "IA" });
    expect(within(ia).getByRole("link", { name: "Testar prompts" })).toBeInTheDocument();
  });

  it("Contingência aparece em destaque", () => {
    render(<StudioNav nav={NAV} />);
    expect(screen.getByRole("link", { name: "Contingência" }).closest("li")).toHaveAttribute(
      "data-emphasis",
      "true",
    );
  });

  it("com busca, filtra o trilho do desktop: “regis” acha Registros", () => {
    render(<StudioNav nav={NAV} search />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar no menu" }), {
      target: { value: "regis" },
    });
    const nav = screen.getByRole("navigation", { name: "Estúdio" });
    expect(within(nav).getByRole("link", { name: "Registros" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Falhas/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar no menu" }), {
      target: { value: "xyz" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma tela com “xyz”.");
  });

  it("o item atual continua marcado mesmo com a lista filtrada", () => {
    render(<StudioNav nav={NAV} search />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar no menu" }), {
      target: { value: "falhas" },
    });
    expect(screen.getByRole("link", { name: "Falhas" })).toHaveAttribute("aria-current", "page");
  });

  it("grupos recolhíveis, lembrados em localStorage por grupo", () => {
    const { unmount } = render(<StudioNav nav={NAV} />);
    const details = screen.getByText("Redação", { selector: "summary *" }).closest("details");
    expect(details).toHaveAttribute("open");
    act(() => {
      details!.open = false;
      fireEvent(details!, new Event("toggle"));
    });
    expect(localStorage.getItem("cn:nav:redacao")).toBe("closed");
    unmount();
    render(<StudioNav nav={NAV} />);
    const again = screen.getByText("Redação", { selector: "summary *" }).closest("details");
    expect(again).not.toHaveAttribute("open");
  });

  it("busca abre os grupos recolhidos sem apagar a preferência", () => {
    localStorage.setItem("cn:nav:control-center", "closed");
    render(<StudioNav nav={NAV} search />);
    const details = () =>
      screen.getByText("Control Center", { selector: "summary *" }).closest("details");
    expect(details()).not.toHaveAttribute("open");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar no menu" }), {
      target: { value: "regis" },
    });
    expect(details()).toHaveAttribute("open");
    expect(localStorage.getItem("cn:nav:control-center")).toBe("closed");
  });

  it("sem localStorage (bloqueado), a navegação continua aberta e não quebra", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<StudioNav nav={NAV} />);
    expect(screen.getByRole("link", { name: "Registros" })).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("StudioNavSearch · Esc", () => {
  it("com texto, limpa a busca e não deixa o Esc seguir (a gaveta continua aberta)", () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <StudioNavSearch value="regis" onChange={onChange} />
      </div>,
    );
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    screen.getByRole("searchbox").dispatchEvent(ev);
    expect(onChange).toHaveBeenCalledWith("");
    expect(ev.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it("vazio, o Esc segue para fechar a gaveta", () => {
    const onChange = vi.fn();
    render(<StudioNavSearch value="" onChange={onChange} />);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    screen.getByRole("searchbox").dispatchEvent(ev);
    expect(onChange).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});
