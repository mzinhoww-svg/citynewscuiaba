import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

it("logo tem nome acessível com a grafia oficial", () => {
  render(<Logo variant="horizontal" size="md" />);
  expect(screen.getByRole("img", { name: "CityNews Cuiabá" })).toBeInTheDocument();
});

it("símbolo sozinho se chama CityNews e a linha geográfica muda o nome", () => {
  render(
    <>
      <Logo variant="symbol" />
      <Logo variant="horizontal" city="Várzea Grande" />
      <Logo variant="horizontal" city="Guia Cuiabá" tone="negative" />
    </>,
  );
  expect(screen.getByRole("img", { name: "CityNews" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "CityNews Várzea Grande" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "CityNews Guia Cuiabá" })).toBeInTheDocument();
});

it("cores vêm de currentColor e tokens, nunca de hex", () => {
  const { container } = render(<Logo variant="vertical" tone="mono" />);
  expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(container.querySelector("circle")).toHaveAttribute("fill", "currentColor");
});
