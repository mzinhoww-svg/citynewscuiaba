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

it("institucional esconde dado pendente e a seção que fica vazia (A-146)", () => {
  const { container } = render(
    <DocPage
      title="Sobre"
      intro="Intro"
      path="/sobre"
      sections={[
        { title: "Quem somos", items: ["CNPJ: [PREENCHER]", "Endereço: Avenida São Sebastião"] },
        { title: "Foro", items: ["Foro: [PREENCHER]"] },
      ]}
    />,
  );
  expect(container.textContent).not.toContain("PREENCHER");
  expect(screen.queryByText(/aguardam dados oficiais/)).toBeNull();
  expect(screen.getByText("Endereço: Avenida São Sebastião")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Foro" })).toBeNull();
});

it("404 e 500 são compactos no celular (busca e ações sobem acima do banner)", () => {
  const { container, unmount } = render(<NotFoundState />);
  expect(container.firstElementChild).toHaveClass("py-6");
  expect(container.firstElementChild).not.toHaveClass("py-12");
  unmount();
  const r = render(<ErrorState reset={() => {}} />);
  expect(r.container.firstElementChild).toHaveClass("py-6");
});
