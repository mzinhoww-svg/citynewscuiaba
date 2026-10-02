import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DocPage, ErrorState, GoneState, NotFoundState } from "../index";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

it("404 tem título, busca e volta ao início", () => {
  render(<NotFoundState />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Não encontramos/);
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
});

it("410 mostra o motivo e leva às correções", () => {
  render(<GoneState reason="A informação não se confirmou." />);
  expect(screen.getByText(/A informação não se confirmou/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver correções" })).toHaveAttribute("href", "/correcoes");
});

it("500 tenta de novo e mostra o código", async () => {
  const reset = vi.fn();
  render(<ErrorState digest="abc123" reset={reset} />);
  expect(screen.getByText("Código do erro: abc123")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(reset).toHaveBeenCalled();
});

it("institucional destaca dado pendente e explica", () => {
  render(
    <DocPage
      title="Sobre"
      intro="Intro"
      path="/sobre"
      sections={[{ title: "Quem somos", items: ["CNPJ: [PREENCHER]"] }]}
    />,
  );
  expect(screen.getByText("[PREENCHER]").tagName).toBe("MARK");
  expect(screen.getByText(/aguardam dados oficiais/)).toBeInTheDocument();
});
