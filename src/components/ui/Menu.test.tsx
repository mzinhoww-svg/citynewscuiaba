import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Menu } from "./Menu";

function setup() {
  const edit = vi.fn();
  const remove = vi.fn();
  render(
    <Menu
      label="Ações da fonte"
      items={[
        { label: "Editar", onSelect: edit, icon: "pencil" },
        { label: "Pausar", onSelect: vi.fn() },
        { label: "Excluir", onSelect: remove, destructive: true },
      ]}
      trigger={({ ref, props }) => (
        <button ref={ref} type="button" aria-label="Mais opções" {...props}>
          …
        </button>
      )}
    />,
  );
  return { trigger: screen.getByRole("button", { name: "Mais opções" }), edit, remove };
}

describe("Menu", () => {
  it("abre um menu com itens e foco no primeiro", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Ações da fonte" })).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Editar", "Pausar", "Excluir"]);
    expect(document.activeElement).toBe(items[0]);
  });

  it("seta para baixo move o foco; Home, End e volta ao início", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("seta para baixo no gatilho abre o menu", () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("escolher um item fecha, devolve o foco e chama a ação", () => {
    const { trigger, remove } = setup();
    fireEvent.click(trigger);
    const excluir = screen.getByRole("menuitem", { name: "Excluir" });
    expect(excluir.className).toMatch(/text-danger/);
    fireEvent.click(excluir);
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Esc fecha e devolve o foco ao gatilho", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
