import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { default: StudioError } = await import("./error");

it("falha de banco no Estúdio fica dentro do shell, com tentar de novo e volta à fila", async () => {
  const reset = vi.fn();
  render(
    <StudioError error={Object.assign(new Error("db down"), { digest: "abc123" })} reset={reset} />,
  );
  expect(
    screen.getByRole("heading", { name: "Não foi possível carregar esta tela do Estúdio" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("db down")).not.toBeInTheDocument();
  expect(screen.getByText(/abc123/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para a redação" })).toHaveAttribute(
    "href",
    "/estudio",
  );
  await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(reset).toHaveBeenCalled();
});
