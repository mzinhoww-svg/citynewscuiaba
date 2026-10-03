import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { EventView } from "@/lib/db/queries/types";
import { EventCard } from "../index";

const act = vi.fn(async (fn: (s: unknown) => unknown) => fn(store));
const store = { save: vi.fn(), unsave: vi.fn() };
let saved: { ref: string }[] = [];

vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: { saved }, ready: true, act }),
}));

const event: EventView = {
  id: "e1",
  slug: "noite-de-rasqueado",
  href: "/agenda/noite-de-rasqueado",
  title: "Noite de rasqueado no Sesc Arsenal",
  startsAt: "2026-10-16T20:00:00-04:00",
  endsAt: "2026-10-17T01:30:00-04:00",
  venue: "Sesc Arsenal",
  neighborhood: "Centro",
  priceCents: null,
  isFree: true,
  ageRating: "livre",
  category: "musica",
  accessibility: null,
  origin: "organizer",
  description: null,
  confirmedAt: null,
};

beforeEach(() => {
  saved = [];
  store.save.mockClear();
  store.unsave.mockClear();
});

describe("EventCard", () => {
  it("mostra capa com a data, título como link, hora · local e preço", () => {
    render(<EventCard event={event} />);
    const card = screen.getByRole("article");
    const cover = within(card).getByTestId("event-cover");
    expect(cover).toHaveAttribute("datetime", event.startsAt);
    expect(cover).toHaveTextContent("16");
    expect(screen.getByRole("link", { name: event.title })).toHaveAttribute("href", event.href);
    expect(card).toHaveTextContent("20h até 1h30 do dia seguinte · Sesc Arsenal, Centro");
    expect(card).toHaveTextContent("Gratuito");
  });

  it("evento pago mostra o preço em reais", () => {
    render(<EventCard event={{ ...event, isFree: false, priceCents: 3000 }} />);
    expect(screen.getByRole("article")).toHaveTextContent(/R\$\s?30,00/);
    expect(screen.queryByText("Gratuito")).toBeNull();
  });

  it("Calendário baixa o .ics do evento; o nome acessível leva o título", () => {
    render(<EventCard event={event} />);
    const link = screen.getByRole("link", { name: `Adicionar ${event.title} ao calendário` });
    expect(link).toHaveAttribute("href", "/api/ics/noite-de-rasqueado");
    expect(link).toHaveAttribute("download");
    expect(link).toHaveTextContent("Calendário");
  });

  it("Salvar guarda no perfil local com título, link e seção, e alterna", async () => {
    const { rerender } = render(<EventCard event={event} />);
    const save = screen.getByRole("button", { name: `Salvar ${event.title}` });
    expect(save).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(save);
    expect(act).toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledWith("event:e1", 0, {
      title: event.title,
      href: event.href,
      section: "agenda",
    });
    saved = [{ ref: "event:e1" }];
    rerender(<EventCard event={event} />);
    const pressed = screen.getByRole("button", { name: `Salvar ${event.title}` });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(pressed);
    expect(store.unsave).toHaveBeenCalledWith("event:e1");
  });

  it("botões ficam acima do link do card (relative) e o card tem só 1 link de título", () => {
    render(<EventCard event={event} />);
    const save = screen.getByRole("button", { name: /^Salvar / });
    expect(save.closest("div")).toHaveClass("relative");
  });
});
