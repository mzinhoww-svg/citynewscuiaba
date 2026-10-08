import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { EVENT_FORM_IDLE, type EventFormState } from "@/lib/agenda/form-state";
import { EventForm } from "./EventForm";

const categories = [
  { value: "musica", label: "Música" },
  { value: "feira", label: "Feira" },
];
const F = T.form.fields;

describe("EventForm", () => {
  it("todos os campos com rótulo visível; cadastro sem id escondido", () => {
    const { container } = render(
      <EventForm action={async () => EVENT_FORM_IDLE} categories={categories} cancelHref="/x" />,
    );
    for (const label of [
      F.title,
      F.startsAt,
      F.endsAt,
      F.venue,
      F.neighborhood,
      F.price,
      F.category,
      F.ageRating,
      F.accessibility,
      F.link,
      F.description,
    ])
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: F.priceUnknown })).not.toBeChecked();
    expect(container.querySelector('input[name="id"]')).toBeNull();
    expect(screen.getByRole("button", { name: T.form.save })).toBeVisible();
    expect(screen.getByRole("link", { name: T.form.cancel })).toHaveAttribute("href", "/x");
  });

  it("edição: valores guardados preenchidos e id no envio", async () => {
    const action = vi.fn<(s: EventFormState, fd: FormData) => Promise<EventFormState>>(
      async () => EVENT_FORM_IDLE,
    );
    render(
      <EventForm
        action={action}
        categories={categories}
        cancelHref="/x"
        eventId="e1"
        initial={{
          title: "Noite do Siriri",
          startsAt: "2026-10-17T20:00",
          venue: "Casa Cerrado Vivo",
          priceUnknown: "1",
          category: "musica",
          ageRating: "consulte",
        }}
      />,
    );
    expect(screen.getByLabelText(F.title)).toHaveValue("Noite do Siriri");
    expect(screen.getByRole("checkbox", { name: F.priceUnknown })).toBeChecked();
    expect(screen.getByLabelText(F.category)).toHaveValue("musica");
    await userEvent.setup().click(screen.getByRole("button", { name: T.form.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls[0]![1];
    expect(fd.get("id")).toBe("e1");
    expect(fd.get("title")).toBe("Noite do Siriri");
  });

  it("erros por campo ligados ao campo e resumo anunciado; o que foi digitado volta", () => {
    render(
      <EventForm
        action={async () => EVENT_FORM_IDLE}
        categories={categories}
        cancelHref="/x"
        initialState={{
          status: "invalid",
          message: T.form.summary(2),
          errors: { link: T.errors.link, endsAt: T.errors.endsAt },
          values: { title: "Feira", link: "http://feira.example" },
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(T.form.summary(2));
    expect(screen.getByLabelText(F.link)).toHaveAccessibleDescription(
      expect.stringContaining(T.errors.link),
    );
    expect(screen.getByLabelText(F.link)).toHaveValue("http://feira.example");
    expect(screen.getByLabelText(F.title)).toHaveValue("Feira");
    expect(screen.getByText(T.errors.endsAt)).toBeVisible();
  });
});
