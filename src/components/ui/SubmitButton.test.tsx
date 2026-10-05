import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const status = { pending: false };
vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  useFormStatus: () => status,
}));

import { SubmitButton } from "./SubmitButton";

beforeEach(() => {
  status.pending = false;
});

describe("SubmitButton (item 34)", () => {
  it("é botão de envio habilitado fora do envio", () => {
    render(<SubmitButton>Salvar</SubmitButton>);
    const b = screen.getByRole("button", { name: "Salvar" });
    expect(b).toHaveAttribute("type", "submit");
    expect(b).toBeEnabled();
  });

  it("desabilita e mostra Salvando… durante o envio", () => {
    status.pending = true;
    render(<SubmitButton>Salvar</SubmitButton>);
    const b = screen.getByRole("button");
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveTextContent("Salvando…");
  });

  it("pendingLabel substitui o texto padrão", () => {
    status.pending = true;
    render(<SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton>);
    expect(screen.getByRole("button")).toHaveTextContent("Enviando…");
  });
});
