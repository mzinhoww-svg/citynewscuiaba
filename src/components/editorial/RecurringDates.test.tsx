import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { upcomingRecurring } from "@/lib/agenda/recurring";
import { RecurringDates } from "./RecurringDates";

const items = upcomingRecurring(new Date("2026-04-01T12:00:00Z"), 3);

describe("RecurringDates", () => {
  it("mostra o título, data e link de conferência de cada item", () => {
    render(<RecurringDates items={items} id="r" />);
    const section = screen.getByRole("region", {
      name: "Datas e eventos recorrentes de Cuiabá",
    });
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(section).getByText("Aniversário de Cuiabá (feriado municipal)"),
    ).toBeInTheDocument();
    const links = within(section).getAllByRole("link");
    links.forEach((a) => {
      expect(a).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
  it("sem itens não renderiza bloco vazio", () => {
    const { container } = render(<RecurringDates items={[]} id="r" />);
    expect(container).toBeEmptyDOMElement();
  });
});
