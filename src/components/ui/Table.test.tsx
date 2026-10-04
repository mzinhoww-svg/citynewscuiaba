import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTable } from "../studio/admin/AdminStatus";
import { Table } from "./Table";

const LONG = "Secretaria Municipal de Mobilidade Urbana de Cuiabá e Várzea Grande · comunicado"
  .padEnd(80, "x")
  .slice(0, 80);

function Row() {
  return (
    <tr>
      <td>{LONG}</td>
      <td>12</td>
    </tr>
  );
}

describe("Table", () => {
  it("tem legenda (só para leitor de tela por padrão) e região rolável focável com nome", () => {
    render(
      <Table caption="Fontes cadastradas" headers={["Fonte", "Itens"]}>
        <Row />
      </Table>,
    );
    const table = screen.getByRole("table", { name: "Fontes cadastradas" });
    const caption = table.querySelector("caption");
    expect(caption).toHaveTextContent("Fontes cadastradas");
    expect(caption).toHaveClass("sr-only");
    const region = screen.getByRole("region", { name: "Fontes cadastradas" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto");
    expect(region).toContainElement(table);
  });

  it("legenda visível quando pedida", () => {
    render(
      <Table caption="Fontes" headers={["Fonte"]} captionVisible>
        <tr>
          <td>a</td>
        </tr>
      </Table>,
    );
    expect(screen.getByRole("table").querySelector("caption")).not.toHaveClass("sr-only");
  });

  it("cabeçalhos com scope=col, rótulo só para leitor de tela e alinhamento", () => {
    render(
      <Table
        caption="Fontes"
        headers={["Fonte", { label: "Itens", align: "right" }, { label: "Ações", srOnly: true }]}
      >
        <tr>
          <td>a</td>
          <td>1</td>
          <td>b</td>
        </tr>
      </Table>,
    );
    const ths = screen.getAllByRole("columnheader");
    expect(ths).toHaveLength(3);
    for (const th of ths) expect(th).toHaveAttribute("scope", "col");
    expect(ths[1]).toHaveClass("text-right");
    expect(within(ths[2]!).getByText("Ações")).toHaveClass("sr-only");
    expect(screen.getByRole("table").querySelector("thead")).toHaveClass("type-meta", "text-meta");
  });

  it("minWidth vira largura mínima em rem", () => {
    const { rerender } = render(
      <Table caption="Fontes" headers={["Fonte"]} minWidth="sm">
        <Row />
      </Table>,
    );
    expect(screen.getByRole("table")).toHaveClass("table-sm");
    rerender(
      <Table caption="Fontes" headers={["Fonte"]} minWidth="xl">
        <Row />
      </Table>,
    );
    expect(screen.getByRole("table")).toHaveClass("table-xl");
  });

  it("texto de 80 caracteres numa célula quebra em vez de estourar", () => {
    expect(LONG).toHaveLength(80);
    render(
      <Table caption="Fontes" headers={["Fonte", "Itens"]}>
        <Row />
      </Table>,
    );
    const table = screen.getByRole("table");
    expect(table).toHaveClass("w-full", "[&_td]:[overflow-wrap:anywhere]");
    expect(screen.getByRole("cell", { name: LONG })).toBeInTheDocument();
  });
});

describe("AdminTable (wrapper de Table)", () => {
  it("mantém a API: legenda, cabeçalhos e minWidth por classe", () => {
    render(
      <AdminTable caption="Equipe" headers={["Nome", "Papéis"]} minWidth="min-w-[48rem]">
        <tr>
          <td>Marta</td>
          <td>admin</td>
        </tr>
      </AdminTable>,
    );
    const table = screen.getByRole("table", { name: "Equipe" });
    expect(table).toHaveClass("min-w-[48rem]");
    expect(screen.getByRole("region", { name: "Equipe" })).toHaveAttribute("tabindex", "0");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Nome",
      "Papéis",
    ]);
  });

  it("sem minWidth usa 40rem como antes", () => {
    render(
      <AdminTable caption="Equipe" headers={["Nome"]}>
        <tr>
          <td>Marta</td>
        </tr>
      </AdminTable>,
    );
    expect(screen.getByRole("table")).toHaveClass("min-w-[40rem]");
  });
});
