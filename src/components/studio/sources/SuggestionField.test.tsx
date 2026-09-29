import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuggestionField } from "./SuggestionField";

describe("SuggestionField", () => {
  it("sugestão da IA só entra no campo com clique", async () => {
    render(
      <SuggestionField
        name="categories"
        label="Editorias"
        suggestion={{ value: ["cidade"], origin: "ia", confidence: 0.8 }}
      />,
    );
    expect(screen.getByLabelText("Editorias")).toHaveValue("");
    expect(screen.getByText("Sugestão da IA")).toBeInTheDocument();
    expect(screen.getByText("confiança 80%")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão da IA para Editorias" }),
    );
    expect(screen.getByLabelText("Editorias")).toHaveValue("cidade");
    expect(screen.getByText("Sugestão aplicada")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Usar sugestão da IA para Editorias" }),
    ).not.toBeInTheDocument();
  });

  it("sugestão automática já vem preenchida, pode ser editada e restaurada", async () => {
    render(
      <SuggestionField
        name="name"
        label="Nome da fonte"
        suggestion={{ value: "Voz do Coxipó", origin: "regra" }}
      />,
    );
    const input = screen.getByLabelText("Nome da fonte");
    expect(input).toHaveValue("Voz do Coxipó");
    expect(screen.getByText("Sugestão automática")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "Outro nome");
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão automática para Nome da fonte" }),
    );
    expect(input).toHaveValue("Voz do Coxipó");
  });

  it("registra o campo aceito só enquanto o valor é o sugerido", async () => {
    const { container } = render(
      <SuggestionField
        name="locality"
        label="Localidade"
        kind="select"
        options={[
          { value: "cuiaba", label: "Cuiabá" },
          { value: "mt", label: "Mato Grosso" },
        ]}
        defaultValue="mt"
        suggestion={{ value: "cuiaba", origin: "ia", confidence: 0.6 }}
      />,
    );
    const accepted = () => container.querySelector('input[name="acceptedFields"]');
    expect(accepted()).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão da IA para Localidade" }),
    );
    expect(screen.getByLabelText("Localidade")).toHaveValue("cuiaba");
    expect(accepted()).toHaveValue("locality");
    await userEvent.selectOptions(screen.getByLabelText("Localidade"), "mt");
    expect(accepted()).toBeNull();
  });

  it("sem sugestão, é um campo comum com erro em texto e ícone", () => {
    render(<SuggestionField name="slug" label="Identificador" error="Use letras minúsculas." />);
    expect(screen.getByLabelText("Identificador")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Use letras minúsculas.")).toBeInTheDocument();
    expect(screen.queryByText("Sugestão da IA")).not.toBeInTheDocument();
  });

  it("selo de exigência de aprovação aparece em texto", () => {
    render(
      <SuggestionField
        name="reliability"
        label="Confiabilidade"
        kind="select"
        options={[
          { value: "standard", label: "Padrão" },
          { value: "primary", label: "Fonte primária" },
        ]}
        suggestion={{ value: "primary", origin: "regra", needsApproval: true }}
      />,
    );
    expect(screen.getByText("Exige segunda aprovação")).toBeInTheDocument();
  });
});
