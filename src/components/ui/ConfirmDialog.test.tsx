import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function setup(over: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Apagar a matéria Chuva no Coxipó?"
      body="A matéria sai do portal e do índice de busca."
      confirmLabel="Apagar matéria"
      onConfirm={onConfirm}
      onClose={onClose}
      {...over}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDialog (item 35)", () => {
  it("mostra título e corpo; Cancelar vem antes da ação no DOM", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Apagar a matéria Chuva no Coxipó?");
    expect(dialog).toHaveTextContent("A matéria sai do portal");
    const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
    const action = within(dialog).getByRole("button", { name: "Apagar matéria" });
    expect(cancel.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fechado não renderiza", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cliques duplos chamam onConfirm uma vez", async () => {
    const { onConfirm } = setup();
    const action = screen.getByRole("button", { name: "Apagar matéria" });
    await userEvent.dblClick(action);
    await userEvent.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("com onConfirm assíncrono, libera de novo depois que a promessa termina", async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    setup({ onConfirm });
    const action = screen.getByRole("button", { name: "Apagar matéria" });
    await userEvent.click(action);
    await userEvent.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await userEvent.click(screen.getByRole("button", { name: "Apagar matéria" }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("Cancelar chama onClose e não confirma", async () => {
    const { onConfirm, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("destructive usa o botão sólido de perigo", () => {
    setup({ destructive: true });
    expect(screen.getByRole("button", { name: "Apagar matéria" }).className).toMatch(
      /\bbg-danger\b/,
    );
  });

  it("pending desabilita as duas ações e marca a ação como ocupada", () => {
    setup({ pending: true });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    const busy = within(dialog)
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-busy") === "true");
    expect(busy).toBeDefined();
    expect(busy).toBeDisabled();
  });

  it("ao fechar, devolve o foco ao botão que abriu", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Apagar
          </button>
          <ConfirmDialog
            open={open}
            title="Apagar?"
            body="Some do portal."
            confirmLabel="Apagar matéria"
            onConfirm={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Apagar" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
