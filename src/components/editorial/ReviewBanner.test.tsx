import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewBanner } from "./ReviewBanner";

describe("ReviewBanner", () => {
  it("mostra só 'Esta matéria está em revisão', sem outra explicação", () => {
    const { container } = render(<ReviewBanner />);
    expect(screen.getByRole("complementary", { name: "Aviso sobre a matéria" })).toHaveTextContent(
      "Esta matéria está em revisão",
    );
    expect(container.textContent).toBe("Esta matéria está em revisão");
    // Nunca role="status": não disputa com o aviso de atualização durante a leitura.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("o texto não depende só de cor: ícone decorativo e texto", () => {
    const { container } = render(<ReviewBanner />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
