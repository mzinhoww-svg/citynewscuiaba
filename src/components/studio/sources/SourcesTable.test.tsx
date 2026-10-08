import { render, screen, within } from "@testing-library/react";
import { displayStatusOf, type SourceListRow } from "@/lib/db/queries/sources-admin";
import { SourcesTable } from "./SourcesTable";

type Raw = {
  status: "active" | "paused" | "degraded" | "blocked";
  statusReason?: SourceListRow["statusReason"];
  archived?: boolean;
} & Partial<Omit<SourceListRow, "displayStatus" | "archived" | "statusReason">>;

let seq = 0;

/** Fábrica de `SourceListRow` para os testes: `displayStatus` é derivado como no banco real. */
function row(overrides: Raw): SourceListRow {
  seq += 1;
  const { status, statusReason = null, archived = false, ...rest } = overrides;
  const displayStatus = displayStatusOf({
    status,
    status_reason: statusReason,
    archived_at: archived ? "2026-01-01T00:00:00Z" : null,
  });
  return {
    id: `00000000-0000-0000-0000-00000000000${seq}`,
    slug: `fonte-${seq}`,
    name: `Fonte ${seq}`,
    domain: "fonte.example",
    status,
    statusReason,
    displayStatus,
    archived,
    layer: 2,
    locality: "cuiaba",
    categories: [],
    editorialScore: 3,
    priority: 2,
    frequencyMinutes: null,
    effective: { minutes: 30, raisedBy: null },
    lane: "normal",
    lastFetchedAt: null,
    nextCollectionAt: null,
    operationalScore: null,
    health: "sem_dados",
    errors24h: 0,
    pendingApprovals: 0,
    termsReviewedAt: null,
    version: 1,
    kind: "rss",
    confirms: false,
    eventsLive: null,
    ...rest,
  };
}

describe("SourcesTable", () => {
  it("status e score não dependem só de cor", () => {
    render(
      <SourcesTable
        rows={[row({ status: "paused", statusReason: "auto_failures", editorialScore: 4 })]}
        sort="score"
      />,
    );
    expect(screen.getAllByText("Pausada automaticamente")[0]).toBeVisible();
    expect(screen.getAllByText("4 de 5")[0]).toBeVisible();
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("scope", "col");
  });

  it("cabeçalho ordenado leva aria-sort e link para a mesma coluna com direção trocada", () => {
    render(
      <SourcesTable
        rows={[row({ status: "active", name: "Folha do Cerrado" })]}
        sort="score"
        dir="desc"
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    const scoreHeader = headers.find((h) => h.textContent?.includes("Score"));
    expect(scoreHeader).toHaveAttribute("aria-sort", "descending");
    const link = scoreHeader?.querySelector("a");
    expect(link?.getAttribute("href")).toContain("ordem=score");
    expect(link?.getAttribute("href")).toContain("dir=asc");
  });

  it("cada fonte tem uma caixa de seleção com nome acessível", () => {
    render(
      <SourcesTable rows={[row({ status: "active", name: "Folha do Cerrado" })]} sort="score" />,
    );
    expect(
      screen.getAllByRole("checkbox", { name: "Selecionar Folha do Cerrado" })[0],
    ).toBeInTheDocument();
  });

  it("fontes de eventos: colunas Confirma fatos e Eventos no ar, em texto", () => {
    render(
      <SourcesTable
        variant="events"
        rows={[
          row({ status: "active", name: "Teatro", kind: "events", confirms: true, eventsLive: 3 }),
          row({
            status: "paused",
            statusReason: "pending_activation",
            name: "Radar",
            kind: "events",
            confirms: false,
            eventsLive: 0,
          }),
        ]}
        sort="name"
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Confirma fatos");
    expect(headers).toContain("Eventos no ar");
    expect(headers.some((h) => h?.includes("Score"))).toBe(false);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Sim")).toBeVisible();
    expect(within(table).getByText("Não")).toBeVisible();
    expect(within(table).getByText("3 eventos no ar")).toBeVisible();
    expect(within(table).getByText("Nenhum")).toBeVisible();
  });

  it("lista mista: a fonte de eventos é identificada em texto", () => {
    render(
      <SourcesTable
        rows={[row({ status: "active", name: "Teatro", kind: "events", confirms: true })]}
        sort="score"
      />,
    );
    expect(screen.getAllByText(/Fonte de eventos/)[0]).toBeVisible();
  });
});
