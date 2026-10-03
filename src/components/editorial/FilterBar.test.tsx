import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { FilterBar } from "./FilterBar";

vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));

const fields = [
  {
    name: "periodo",
    label: "Período",
    value: "7d",
    options: [
      { value: "7d", label: "Últimos 7 dias" },
      { value: "tudo", label: "Qualquer data" },
    ],
  },
  {
    name: "bairro",
    label: "Bairro",
    value: "",
    placeholder: "Todos os bairros",
    options: [{ value: "cpa", label: "CPA" }],
  },
];

describe("FilterBar", () => {
  it("mostra cada filtro com rótulo visível e o valor da URL", () => {
    render(
      <FilterBar
        action="/cidade"
        label="Filtros"
        fields={fields}
        clearHref="/cidade"
        clearLabel="Limpar filtros"
        applyLabel="Aplicar filtros"
      />,
    );
    expect(screen.getByLabelText("Período")).toHaveValue("7d");
    expect(screen.getByLabelText("Bairro")).toHaveValue("");
    expect(screen.getByLabelText("Período")).toBeVisible();
  });

  it("aplica ao mudar um campo (sem botão): envia o formulário", () => {
    render(
      <FilterBar
        action="/cidade"
        label="Filtros"
        fields={fields}
        clearHref="/cidade"
        clearLabel="Limpar filtros"
        applyLabel="Aplicar filtros"
      />,
    );
    const form = screen.getByRole("form", { name: "Filtros" });
    const submit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", submit);
    fireEvent.change(screen.getByLabelText("Bairro"), { target: { value: "cpa" } });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Aplicar filtros" })).toBeNull();
  });

  it("guarda os campos ocultos e só mostra Limpar com filtro ativo", () => {
    const { rerender } = render(
      <FilterBar
        action="/busca"
        label="Filtros"
        fields={fields}
        hidden={{ q: "viaduto", tipo: undefined }}
        clearHref="/busca?q=viaduto"
        clearLabel="Limpar filtros"
        applyLabel="Aplicar filtros"
      />,
    );
    expect(document.querySelector('input[type="hidden"][name="q"]')).toHaveValue("viaduto");
    expect(document.querySelector('input[name="tipo"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Limpar filtros" })).toBeNull();
    rerender(
      <FilterBar
        action="/busca"
        label="Filtros"
        fields={fields}
        activeCount={2}
        clearHref="/busca?q=viaduto"
        clearLabel="Limpar filtros"
        applyLabel="Aplicar filtros"
      />,
    );
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute(
      "href",
      "/busca?q=viaduto",
    );
  });

  it("sem JavaScript o botão Aplicar fica dentro de noscript", () => {
    const { container } = render(
      <FilterBar
        action="/cidade"
        label="Filtros"
        fields={fields}
        clearHref="/cidade"
        clearLabel="Limpar filtros"
        applyLabel="Aplicar filtros"
      />,
    );
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
