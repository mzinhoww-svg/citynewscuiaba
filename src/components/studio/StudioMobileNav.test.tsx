import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StudioMobileNav, StudioPageTitle } from "./StudioMobileNav";
import type { StudioNavGroup } from "./StudioShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/estudio/control/logs" }));

// O jsdom não abre `<dialog>` com showModal(); o navegador abre (e2e cobre o modal de verdade).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

const NAV: StudioNavGroup[] = [
  {
    label: "Redação",
    items: [
      { href: "/estudio", label: "Redação", icon: "layout-dashboard", exact: true },
      { href: "/estudio/fila", label: "Fila de matérias", icon: "newspaper" },
      { href: "/estudio/midia", label: "Mídia", icon: "camera" },
    ],
  },
  {
    label: "Control Center",
    items: [
      { href: "/estudio/control", label: "Visão geral", icon: "gauge", exact: true },
      { href: "/estudio/control/logs", label: "Registros", icon: "scroll-text" },
    ],
  },
];
const USER = { name: "ana@citynews.test", role: "Editor-chefe · Revisor" };

function open() {
  render(<StudioMobileNav nav={NAV} user={USER} />);
  const trigger = screen.getByRole("button", { name: "Abrir menu" });
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog", { name: "Menu do Estúdio" }) };
}

describe("StudioMobileNav", () => {
  it("começa fechado: só o botão Menu, sem a lista", () => {
    render(<StudioMobileNav nav={NAV} user={USER} />);
    const trigger = screen.getByRole("button", { name: "Abrir menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Estúdio" })).toBeNull();
  });

  it("abre a gaveta com conta, navegação e item atual marcado", () => {
    const { trigger, dialog } = open();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("ana@citynews.test")).toBeInTheDocument();
    expect(within(dialog).getByText("Editor-chefe · Revisor")).toBeInTheDocument();
    const nav = within(dialog).getByRole("navigation", { name: "Estúdio" });
    expect(within(nav).getByRole("link", { name: "Registros" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Visão geral" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(dialog).getByRole("link", { name: "Ver o portal" })).toBeInTheDocument();
  });

  it("busca no menu sem acento e avisa quando nada casa", () => {
    const { dialog } = open();
    const search = within(dialog).getByRole("searchbox", { name: "Buscar no menu" });
    fireEvent.change(search, { target: { value: "midia" } });
    const nav = within(dialog).getByRole("navigation", { name: "Estúdio" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Mídia"]);
    fireEvent.change(search, { target: { value: "xyz" } });
    expect(within(dialog).getByText("Nenhuma tela com “xyz”.")).toBeInTheDocument();
  });

  it("fecha pelo botão Fechar e ao escolher uma tela", () => {
    const { trigger, dialog } = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar menu" }));
    expect(screen.queryByRole("dialog", { name: "Menu do Estúdio" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    const again = screen.getByRole("dialog", { name: "Menu do Estúdio" });
    fireEvent.click(within(again).getByRole("link", { name: "Fila de matérias" }));
    expect(screen.queryByRole("dialog", { name: "Menu do Estúdio" })).toBeNull();
  });
});

describe("StudioPageTitle", () => {
  it("mostra o nome da tela atual (o item mais específico)", () => {
    render(<StudioPageTitle nav={NAV} />);
    expect(screen.getByText("Registros")).toBeInTheDocument();
  });
});
