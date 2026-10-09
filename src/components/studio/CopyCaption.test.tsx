import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyCaption } from "./CopyCaption";

afterEach(cleanup);

const props = {
  id: "legenda",
  label: "Legenda pronta para colar",
  caption:
    "Agenda da semana\n\nConfirme horários e valores na fonte oficial antes de sair de casa.",
  hint: "90 de 2.200 caracteres",
  copyLabel: "Copiar legenda",
  copiedLabel: "Legenda copiada.",
  failedLabel: "Não deu para copiar.",
};

describe("CopyCaption", () => {
  it("campo só de leitura com a legenda e cópia anunciada", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    render(<CopyCaption {...props} />);
    const field = screen.getByLabelText("Legenda pronta para colar");
    expect(field).toHaveValue(props.caption);
    expect(field).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Copiar legenda" }));
    expect(write).toHaveBeenCalledWith(props.caption);
    expect(screen.getByRole("status")).toHaveTextContent("Legenda copiada.");
  });

  it("falha da área de transferência vira aviso", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => Promise.reject(new Error("negado")) },
      configurable: true,
    });
    render(<CopyCaption {...props} />);
    await user.click(screen.getByRole("button", { name: "Copiar legenda" }));
    expect(screen.getByRole("status")).toHaveTextContent("Não deu para copiar.");
  });
});
