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
    expect(screen.getByText(/confiança 80%/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão da IA para Editorias" }),
    );
    expect(screen.getByLabelText("Editorias")).toHaveValue("cidade");
    // Depois de usada, o botão some (nada para aplicar de novo).
    expect(
      screen.queryByRole("button", { name: "Usar sugestão da IA para Editorias" }),
    ).not.toBeInTheDocument();
  });

  it("sugestão automática (regra) tem selo próprio e avisa o uso", async () => {
    const onUse = vi.fn();
    render(
      <SuggestionField
        name="reliability"
        label="Confiabilidade"
        options={[
          { value: "standard", label: "Padrão" },
          { value: "primary", label: "Primária" },
        ]}
        defaultValue="standard"
        suggestion={{ value: "primary", origin: "regra" }}
        onUse={onUse}
      />,
    );
    expect(screen.getByText("Sugestão automática")).toBeInTheDocument();
    expect(screen.getByLabelText("Confiabilidade")).toHaveValue("standard");
    await userEvent.click(
      screen.getByRole("button", { name: "Usar sugestão automática para Confiabilidade" }),
    );
    expect(screen.getByLabelText("Confiabilidade")).toHaveValue("primary");
    expect(onUse).toHaveBeenCalledWith("primary");
  });

  it("sem sugestão é um campo comum", () => {
    render(<SuggestionField name="locality" label="Localidade" defaultValue="mt" />);
    expect(screen.getByLabelText("Localidade")).toHaveValue("mt");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
