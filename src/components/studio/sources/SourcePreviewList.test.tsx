import { render, screen, within } from "@testing-library/react";
import { SourcePreviewList } from "./SourcePreviewList";

const items = [
  {
    title: "Moradores pedem asfalto",
    url: "https://vozdocoxipo.example/n/1",
    publishedAt: "2026-09-27T15:00:00-04:00",
  },
  { title: "Sem data por aqui", url: "https://vozdocoxipo.example/n/2", publishedAt: null },
];

describe("SourcePreviewList", () => {
  it("lista só título, data e link externo seguro, sem imagem", () => {
    const { container } = render(<SourcePreviewList items={items} />);
    const list = screen.getByRole("list", { name: "Prévia dos últimos itens" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const link = screen.getByRole("link", { name: /Moradores pedem asfalto/ });
    expect(link).toHaveAttribute("href", "https://vozdocoxipo.example/n/1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Sem data")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("conta os itens descartados por instrução", () => {
    render(<SourcePreviewList items={items} dropped={1} />);
    expect(screen.getByText("1 item descartado por conter instruções")).toBeInTheDocument();
  });

  it("estado vazio em texto", () => {
    render(<SourcePreviewList items={[]} />);
    expect(screen.getByText(/Nenhum item com título/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
