import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useHotkeys } from "@/lib/studio/use-hotkeys";
import { HotkeysHelp } from "./HotkeysHelp";

function Screen() {
  useHotkeys({ j: () => {} }, { help: [{ keys: ["j"], label: "Próxima matéria" }] });
  return (
    <>
      <button type="button">Antes</button>
      <input aria-label="Busca" />
    </>
  );
}

describe("HotkeysHelp (UX-W3-T5, item 53)", () => {
  it("? abre a ajuda com os atalhos da tela; fechar devolve o foco", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Screen />
        <HotkeysHelp />
      </>,
    );
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();

    const before = screen.getByRole("button", { name: "Antes" });
    before.focus();
    await user.keyboard("?");
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(within(dialog).getByRole("heading", { hidden: true })).toHaveTextContent(
      "Atalhos de teclado",
    );
    expect(within(dialog).getByText("Próxima matéria")).toBeInTheDocument();
    expect(within(dialog).getByText("Abrir esta ajuda")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Fechar", hidden: true }));
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("? digitado num campo não abre a ajuda", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Screen />
        <HotkeysHelp />
      </>,
    );
    await user.click(screen.getByRole("textbox", { name: "Busca" }));
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    act(() => {});
  });
});
