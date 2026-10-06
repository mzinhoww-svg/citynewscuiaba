import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobTable, type JobRow } from "./JobTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const RUN = "4f1c2a9e-0b7d-4c1e-9f3a-2d6b8e0c1a77";
const row = (over: Partial<JobRow>): JobRow => ({
  kind: "quarantine",
  id: 1,
  step: "classify",
  itemRef: "item:abc",
  runRef: RUN,
  attempts: 4,
  error: "timeout after 3000ms on item 12",
  at: "2026-09-28T12:00:00Z",
  ...over,
});

const rows: JobRow[] = [
  row({ id: 1 }),
  row({ id: 2, itemRef: "item:def", error: "timeout after 3000ms on item 99" }),
  row({ id: 3, kind: "retrying", itemRef: "item:ghi", error: "timeout after 3000ms on item 7" }),
  row({ id: 4, step: "summarize", itemRef: "item:jkl", error: "HTTP 503" }),
];

const actions = () => ({
  retry: vi.fn(async () => ({ ok: true, message: "ok" })),
  discard: vi.fn(async () => ({ ok: true, message: "ok" })),
});

describe("JobTable · seleção", () => {
  it("Selecionar todas em quarentena marca só as em quarentena", async () => {
    const a = actions();
    render(<JobTable rows={rows} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas em quarentena" }));
    expect(screen.getByText("3 selecionadas")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reprocessar selecionadas" }));
    });
    expect(a.retry).toHaveBeenCalledWith({ ids: [1, 2, 4], keepHumanDecisions: true });
  });

  it("Limpar seleção desmarca tudo", () => {
    render(<JobTable rows={rows} actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas em quarentena" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.getByText("0 selecionadas")).toBeInTheDocument();
  });
});

describe("JobTable · grupos", () => {
  it("agrupa por etapa e erro com contagem", () => {
    render(<JobTable rows={rows} actions={actions()} />);
    const list = screen.getByRole("list", { name: "Falhas agrupadas por etapa e erro" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("timeout after #ms on item #");
    expect(items[0]).toHaveTextContent("3 ocorrências");
    expect(items[1]).toHaveTextContent("1 ocorrência");
  });

  it("selecionar o grupo marca só as em quarentena dele", () => {
    render(<JobTable rows={rows} actions={actions()} />);
    const list = screen.getByRole("list", { name: "Falhas agrupadas por etapa e erro" });
    fireEvent.click(
      within(list).getAllByRole("button", { name: /Selecionar 2 em quarentena/ })[0]!,
    );
    expect(screen.getByText("2 selecionadas")).toBeInTheDocument();
  });

  it("sem ações, os grupos não oferecem seleção", () => {
    render(<JobTable rows={rows} />);
    const list = screen.getByRole("list", { name: "Falhas agrupadas por etapa e erro" });
    expect(within(list).queryByRole("button")).toBeNull();
  });
});

describe("JobTable · cartões e links", () => {
  it("cartões abaixo de md e tabela a partir de md, sem duplicar para leitor de tela", () => {
    render(<JobTable rows={rows} actions={actions()} />);
    const region = screen.getByRole("region", { name: "Falhas do pipeline" });
    expect(region.className).toMatch(/\bhidden\b/);
    expect(region.className).toContain("md:block");
    const cards = screen.getByRole("list", { name: "Falhas do pipeline" });
    expect(cards.className).toContain("md:hidden");
    expect(within(cards).getAllByRole("listitem")).toHaveLength(4);
  });

  it("liga cada falha aos logs do objeto e à execução", () => {
    render(<JobTable rows={[row({})]} />);
    const cards = screen.getByRole("list", { name: "Falhas do pipeline" });
    expect(within(cards).getByRole("link", { name: /Logs do objeto:\s*item:abc/ })).toHaveAttribute(
      "href",
      "/estudio/control/logs?item=item%3Aabc",
    );
    expect(within(cards).getByRole("link", { name: /Ver execução/ })).toHaveAttribute(
      "href",
      `/estudio/control/execucoes/${RUN}`,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("link", { name: /Ver execução/ })).toHaveAttribute(
      "href",
      `/estudio/control/execucoes/${RUN}`,
    );
  });

  it("cartão em quarentena tem caixa de seleção; nova tentativa não", () => {
    render(<JobTable rows={[row({}), row({ id: 3, kind: "retrying" })]} actions={actions()} />);
    const cards = screen.getByRole("list", { name: "Falhas do pipeline" });
    const [q, r] = within(cards).getAllByRole("listitem");
    expect(within(q!).getByRole("checkbox", { name: /Selecionar/ })).toBeInTheDocument();
    expect(within(r!).queryByRole("checkbox")).toBeNull();
  });
});
