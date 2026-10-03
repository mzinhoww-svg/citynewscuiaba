import { render, screen } from "@testing-library/react";
import { ConfidenceMeter } from "./ConfidenceMeter";

describe("ConfidenceMeter", () => {
  it("confiança não depende de cor: tem texto", () => {
    render(<ConfidenceMeter level="média" />);
    expect(screen.getByText("Confiança média")).toBeInTheDocument();
  });

  it("três barras, preenchidas conforme o nível", () => {
    const { container } = render(<ConfidenceMeter level="alta" />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-bar='on']")).toHaveLength(3);
    const low = render(<ConfidenceMeter level="baixa" />);
    expect(low.container.querySelectorAll("[data-bar='on']")).toHaveLength(1);
  });
});
