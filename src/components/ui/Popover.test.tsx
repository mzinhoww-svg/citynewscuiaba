import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover } from "./Popover";

function setup(align?: "start" | "end") {
  render(
    <div>
      <Popover
        label="Filtros rápidos"
        align={align}
        trigger={({ ref, props }) => (
          <button ref={ref} type="button" {...props}>
            Abrir filtros
          </button>
        )}
      >
        <p>Conteúdo do painel</p>
        <button type="button">Dentro</button>
      </Popover>
      <button type="button">Fora</button>
    </div>,
  );
  return screen.getByRole("button", { name: "Abrir filtros" });
}

describe("Popover", () => {
  it("começa fechado e abre com aria-expanded e aria-controls no painel", () => {
    const trigger = setup();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Filtros rápidos" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent("Conteúdo do painel");
  });

  it("Esc fecha e devolve o foco ao gatilho", () => {
    const trigger = setup();
    trigger.focus();
    fireEvent.click(trigger);
    const inside = screen.getByRole("button", { name: "Dentro" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("clique fora fecha; clique dentro não", () => {
    const trigger = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Dentro" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Fora" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no celular o painel é fixo; a partir de sm ancora no lado pedido", () => {
    const trigger = setup("end");
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog");
    expect(panel.className).toMatch(/\bfixed\b/);
    expect(panel.className).toMatch(/sm:absolute/);
    expect(panel.className).toMatch(/sm:right-0/);
  });
});
