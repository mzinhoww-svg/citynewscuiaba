import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const path = { value: "/estudio/admin/notificacoes/fila" };
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

import { PushTabsNav } from "./PushTabsNav";

describe("PushTabsNav (D-P23)", () => {
  it("só as abas do papel, com a atual em aria-current=page", () => {
    render(<PushTabsNav tabs={["queue", "history"]} />);
    const nav = screen.getByRole("navigation", { name: "Seções de Notificações" });
    expect(nav).toBeVisible();
    expect(screen.queryByRole("link", { name: "Novo envio" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Configurações" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fila e aprovações" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Histórico" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Histórico" })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes/historico",
    );
  });

  it("a raiz (Novo envio) só acende na rota exata", () => {
    path.value = "/estudio/admin/notificacoes/historico/abc";
    render(<PushTabsNav tabs={["new", "queue", "history", "settings"]} />);
    expect(screen.getByRole("link", { name: "Novo envio" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Histórico" })).toHaveAttribute("aria-current", "page");
  });
});
