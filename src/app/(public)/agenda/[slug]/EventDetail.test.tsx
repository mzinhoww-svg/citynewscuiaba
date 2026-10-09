import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EventView } from "@/lib/db/queries/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: { saved: [] }, ready: true, act: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/agenda/x" }));

const { EventDetail } = await import("./EventDetail");

const base: EventView = {
  id: "e1",
  slug: "forro-da-praca",
  href: "/agenda/forro-da-praca",
  title: "Forró da Praça",
  startsAt: "2026-10-16T20:00:00-04:00",
  endsAt: null,
  venue: "Teatro Exemplo",
  neighborhood: "Centro",
  priceCents: 2000,
  isFree: false,
  ageRating: "16",
  category: "musica",
  accessibility: null,
  origin: "organizer",
  sourceName: "Teatro Exemplo",
  confirmedByName: null,
  confirmed: true,
  description: null,
  confirmedAt: null,
  sourceUrl: "https://teatro.example/evento/forro",
  priceUnknown: false,
  venueSlug: null,
  organizer: null,
  image: null,
  featured: false,
};

const image = {
  src: "/api/media/a0000000-0000-4000-8000-000000000001",
  src480: "/api/media/a0000000-0000-4000-8000-000000000001?w=480",
  src960: "/api/media/a0000000-0000-4000-8000-000000000001?w=960",
  alt: "Imagem de divulgação: Forró da Praça",
  kind: "reproduction" as const,
  credit: "Fonte",
  originUrl: "https://teatro.example/evento/forro",
};

describe("Página do evento (ARD-T4)", () => {
  it("foto com a legenda de reprodução e Ver original para a página da fonte", () => {
    render(<EventDetail e={{ ...base, image }} related={[]} />);
    const figure = screen.getByRole("figure");
    expect(within(figure).getByText(/Foto: reprodução web · Fonte/)).toBeInTheDocument();
    expect(within(figure).getByRole("link", { name: /Ver original/ })).toHaveAttribute(
      "href",
      image.originUrl,
    );
  });

  it("sem foto não há figura nem legenda", () => {
    render(<EventDetail e={base} related={[]} />);
    expect(screen.queryByRole("figure")).toBeNull();
    expect(screen.queryByText(/reprodução web/)).toBeNull();
  });

  it("organização aparece como fato; sem organizador o fato some", () => {
    const { unmount } = render(
      <EventDetail e={{ ...base, organizer: "Coletivo Siriri" }} related={[]} />,
    );
    expect(screen.getByText("Organização", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText("Coletivo Siriri")).toBeInTheDocument();
    unmount();
    render(<EventDetail e={base} related={[]} />);
    expect(screen.queryByText("Organização", { selector: "dt" })).toBeNull();
  });

  it("classificação em texto", () => {
    render(<EventDetail e={base} related={[]} />);
    expect(screen.getByText("A partir de 16 anos")).toBeInTheDocument();
  });

  it("Ver no Guia só com lugar vinculado", () => {
    const { unmount } = render(
      <EventDetail e={{ ...base, venueSlug: "teatro-exemplo" }} related={[]} />,
    );
    expect(screen.getByRole("link", { name: /Ver no Guia/ })).toHaveAttribute(
      "href",
      "/guia-cuiaba/lugar/teatro-exemplo",
    );
    unmount();
    render(<EventDetail e={base} related={[]} />);
    expect(screen.queryByRole("link", { name: /Ver no Guia/ })).toBeNull();
  });

  it("Salvar na página do evento, com o título no nome acessível", () => {
    render(<EventDetail e={base} related={[]} />);
    expect(screen.getByRole("button", { name: `Salvar ${base.title}` })).toBeInTheDocument();
  });

  it("nenhum termo proibido na tela pública", () => {
    const { container } = render(
      <EventDetail
        e={{ ...base, image, organizer: "Coletivo", venueSlug: "teatro-exemplo" }}
        related={[]}
      />,
    );
    expect(container.textContent).not.toMatch(/\bIA\b|gerad[oa]|normalizad/i);
  });
});
