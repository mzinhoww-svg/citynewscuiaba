import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { stubDialog } from "./dialog-test-utils";
import { Dialog } from "./Dialog";

let calls: ReturnType<typeof stubDialog>;
beforeEach(() => {
  calls = stubDialog();
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Sair
      </button>
      <Dialog
        open={open}
        title="Tem certeza de que deseja sair?"
        onClose={() => setOpen(false)}
        actions={
          <button type="button" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        }
      >
        Você vai precisar entrar de novo.
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("título no estilo de navegação e aria-describedby apontando para o corpo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    const dialog = screen.getByRole("dialog", { name: "Tem certeza de que deseja sair?" });
    expect(screen.getByRole("heading", { name: "Tem certeza de que deseja sair?" })).toHaveClass(
      "type-nav-title",
    );
    const bodyId = dialog.getAttribute("aria-describedby");
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)).toHaveTextContent("Você vai precisar entrar de novo.");
    expect(dialog).toHaveAccessibleDescription("Você vai precisar entrar de novo.");
  });

  it("sem corpo, não há aria-describedby", () => {
    render(<Dialog title="Só o título" />);
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("fechado chama close() antes de desmontar e devolve o foco ao botão que abriu", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Sair" });
    opener.focus();
    fireEvent.click(opener);
    expect(calls.showModal).toBe(1);
    screen.getByRole("button", { name: "Cancelar" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.closeWhileConnected).toBe(1);
    expect(calls.closeDetached).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it("inline descreve o corpo sem abrir modal", () => {
    render(
      <Dialog inline title="Vitrine">
        Corpo
      </Dialog>,
    );
    expect(calls.showModal).toBe(0);
    expect(screen.getByRole("dialog", { name: "Vitrine" })).toHaveAccessibleDescription("Corpo");
  });
});
