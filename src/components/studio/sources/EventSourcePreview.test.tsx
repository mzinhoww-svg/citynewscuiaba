import { render, screen, within } from "@testing-library/react";
import type { EventSourcePreviewData } from "@/lib/agenda/preview";
import { EventSourcePreview } from "./EventSourcePreview";

const PREVIEW: EventSourcePreviewData = {
  status: "ok",
  detail: null,
  found: 3,
  approved: 2,
  aiPages: 4,
  events: [
    {
      title: "Forró da Praça",
      startsAt: "2026-10-25T00:00:00.000Z",
      venue: "Teatro Cerrado",
      sourceUrl: "https://teatro-cerrado.example/evento/forro-da-praca",
      evidence: {
        titulo: { trecho: "Forró da Praça", ano: "ausente" },
        data: { trecho: "sábado, 24 de outubro de 2026", ano: "corpo" },
        horario: { trecho: "20h", ano: "ausente" },
        local: { trecho: "Teatro Cerrado", ano: "ausente" },
      },
    },
    {
      title: "Feira Livre",
      startsAt: "2026-10-11T04:00:00.000Z",
      venue: "Praça Central",
      sourceUrl: "https://teatro-cerrado.example/evento/feira",
      evidence: {},
    },
  ],
  rejected: [
    { url: "https://teatro-cerrado.example/evento/sarau-de-verao", reason: "sem_ano" },
    { url: "https://teatro-cerrado.example/evento/velho", reason: "data_passada" },
  ],
};

describe("EventSourcePreview", () => {
  it("mostra cada evento com o trecho de evidência de cada campo", () => {
    render(<EventSourcePreview preview={PREVIEW} />);
    expect(screen.getByRole("heading", { name: "Prévia da coleta" })).toBeVisible();
    expect(screen.getByText("3 encontrados · 2 aprovados · 4 chamadas à IA")).toBeVisible();
    const events = screen.getByRole("list", { name: "Eventos aprovados" });
    const items = within(events).getAllByRole("listitem", { name: /./ });
    expect(items).toHaveLength(2);
    const forro = items[0]!;
    expect(within(forro).getByRole("heading", { name: "Forró da Praça" })).toBeVisible();
    expect(within(forro).getByText("“sábado, 24 de outubro de 2026”")).toBeVisible();
    expect(within(forro).getByText(/ano no texto da página/)).toBeVisible();
    expect(within(forro).getByText("“20h”")).toBeVisible();
    expect(within(forro).getByText("“Teatro Cerrado”")).toBeVisible();
    expect(within(forro).getByText("Data")).toBeVisible();
    expect(within(forro).getByRole("link", { name: /Abrir a página do evento/ })).toHaveAttribute(
      "href",
      "https://teatro-cerrado.example/evento/forro-da-praca",
    );
    // Evento estruturado, sem trechos: diz em texto.
    expect(within(items[1]!).getByText("Sem trechos: dado estruturado da fonte.")).toBeVisible();
  });

  it("mostra o motivo de cada recusa em texto, com a página", () => {
    render(<EventSourcePreview preview={PREVIEW} />);
    const rejected = screen.getByRole("list", { name: "Recusados nesta prévia" });
    const rows = within(rejected).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Data sem ano na página")).toBeVisible();
    expect(within(rows[0]!).getByText(/sarau-de-verao/)).toBeVisible();
    expect(within(rows[1]!).getByText("Data já passou")).toBeVisible();
  });

  it("sem eventos e com a fonte bloqueada: estado vazio e situação em texto", () => {
    render(
      <EventSourcePreview
        preview={{
          ...PREVIEW,
          status: "robots",
          detail: "robots.txt bloqueia /",
          found: 0,
          approved: 0,
          aiPages: 0,
          events: [],
          rejected: [],
        }}
      />,
    );
    expect(screen.getByText("Nenhum evento aprovado nesta prévia.")).toBeVisible();
    expect(screen.getByText(/Bloqueada pelo robots.txt/)).toBeVisible();
    expect(screen.getByText(/robots.txt bloqueia \//)).toBeVisible();
    expect(screen.getByText("Nenhum evento recusado.")).toBeVisible();
  });
});
