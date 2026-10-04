import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SignUpState } from "@/lib/auth/form-state";
import { SignUpForm } from "./SignUpForm";

describe("SignUpForm (gate P2, M9)", () => {
  it("limite de tentativas mostra a mensagem de limite, não a de serviço fora", async () => {
    const action = vi.fn(async (): Promise<SignUpState> => ({ status: "rate_limited" }));
    render(<SignUpForm action={action} google={null} next="/perfil" />);
    fireEvent.click(screen.getByRole("button", { name: /Criar conta/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Muitas tentativas/);
    expect(screen.queryByText(/Não conseguimos falar com o serviço/)).toBeNull();
  });
});
