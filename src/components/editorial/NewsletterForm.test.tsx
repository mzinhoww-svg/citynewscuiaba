import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NEWSLETTER_IDLE } from "@/lib/newsletter/form-state";
import { NewsletterForm } from "./NewsletterForm";

/* UI-T11: o formulário de newsletter pede só o e-mail (spec §5); nada de nome, telefone ou senha. */
const action = async () => NEWSLETTER_IDLE;

describe("NewsletterForm", () => {
  it("único campo de texto visível é o e-mail, com botão nomeado", () => {
    render(<NewsletterForm action={action} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName("E-mail");
    expect(boxes[0]).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Inscrever" })).toBeVisible();
    expect(document.querySelector('input[type="password"], input[type="tel"]')).toBeNull();
  });

  it("com listas, só acrescenta a escolha das newsletters", () => {
    render(
      <NewsletterForm
        action={action}
        lists={[
          { id: "diaria", name: "Cuiabá em 5 minutos", when: "Todo dia, às 7h" },
          { id: "agenda-fds", name: "Agenda do fim de semana", when: "Quinta, às 12h" },
        ]}
      />,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: /Cuiabá em 5 minutos/ })).toBeChecked();
  });
});
