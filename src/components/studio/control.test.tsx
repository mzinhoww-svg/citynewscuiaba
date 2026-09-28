import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { JobTable } from "./JobTable";
import { PhaseChart } from "./PhaseChart";
import { SourceHealthTable, type SourceHealthItem } from "./SourceHealthTable";
import { usePolling } from "./usePolling";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const source = (over: Partial<SourceHealthItem>): SourceHealthItem => ({
  id: over.name ?? "x",
  name: "Fonte",
  status: "active",
  autoPaused: false,
  consecutiveFailures: 0,
  errors24h: 0,
  items24h: 0,
  ok30d: 10,
  total30d: 10,
  lastFetchedAt: null,
  lastError: null,
  ...over,
});

describe("SourceHealthTable", () => {
  it("mostra Pausada (auto) com ícone e texto e ordena por falhas seguidas", () => {
    render(
      <SourceHealthTable
        rows={[
          source({ name: "Folha do Cerrado" }),
          source({
            name: "Cena Cuiabana",
            status: "paused",
            autoPaused: true,
            consecutiveFailures: 3,
            lastError: "HTTP 503",
          }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("rowheader")).toHaveTextContent("Cena Cuiabana");
    expect(rows[0]).toHaveTextContent("Pausada (auto)");
    expect(rows[1]).toHaveTextContent("Ativa");
    const failures = screen.getByRole("columnheader", { name: /Falhas seguidas/ });
    expect(failures).toHaveAttribute("aria-sort", "descending");
  });

  it("ordenar por nome é acessível: botão no cabeçalho e aria-sort", () => {
    render(
      <SourceHealthTable rows={[source({ name: "MT Agora" }), source({ name: "Agência MT" })]} />,
    );
    const header = screen.getByRole("columnheader", { name: /Fonte/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    const first = screen.getAllByRole("row")[1]!;
    expect(first).toHaveTextContent("Agência MT");
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });
});

describe("PhaseChart", () => {
  it("tem resumo textual de cada fase", () => {
    render(
      <PhaseChart
        label="Fases"
        phases={[
          { phase: "coleta", startMin: 0, durationMin: 4, ok: 8, failed: 1, retried: 0 },
          { phase: "entendimento", startMin: 5, durationMin: 2.5, ok: 6, failed: 0, retried: 1 },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Fases" })).toBeInTheDocument();
    expect(
      screen.getByText("Coleta: começou em 0 min e durou 4 min; 8 concluídos, 1 com falha."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Entendimento: começou em 5 min e durou 2,5 min/)).toBeInTheDocument();
  });
});

describe("JobTable", () => {
  const rows = [
    {
      kind: "quarantine" as const,
      id: 1,
      step: "classify",
      itemRef: "item:abc",
      runRef: null,
      attempts: 4,
      error: "transient: timeout",
      at: "2026-09-28T12:00:00Z",
    },
  ];
  it("sem ações é só leitura", () => {
    render(<JobTable rows={rows} />);
    expect(screen.getByText("Seu papel vê as falhas, mas não reprocessa.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("reprocessa as selecionadas mantendo decisões humanas por padrão", async () => {
    const retry = vi.fn(async () => ({ ok: true, message: "1 objeto voltou à fila." }));
    render(<JobTable rows={rows} actions={{ retry, discard: vi.fn() }} />);
    expect(screen.getByRole("checkbox", { name: "Manter decisões humanas" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Selecionar 8 · Classificar/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reprocessar selecionadas" }));
    });
    expect(retry).toHaveBeenCalledWith({ ids: [1], keepHumanDecisions: true });
    expect(await screen.findByText("1 objeto voltou à fila.")).toBeInTheDocument();
  });
});

describe("usePolling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("busca a cada 5 s, para com a aba oculta e atualiza ao voltar", async () => {
    let n = 0;
    const load = vi.fn(async () => ++n);
    const { result } = renderHook(() => usePolling(load, 0));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe(1);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.hidden).toBe(true);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.hidden).toBe(false);
  });

  it("pausado pela pessoa não busca; falha mantém os dados e marca como desatualizado", async () => {
    const load = vi.fn(async () => {
      throw new Error("503");
    });
    const { result } = renderHook(() => usePolling(load, 7));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.stale).toBe(true);
    expect(result.current.data).toBe(7);
    act(() => result.current.setPaused(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("CostChart", () => {
  it("resumo em texto, tabela oculta com cada dia e orçamento fora da escala avisado", async () => {
    const { CostChart } = await import("./CostChart");
    render(
      <CostChart
        label="Gasto diário"
        days={[
          { day: "2026-09-27", costBrl: 1 },
          { day: "2026-09-28", costBrl: 2 },
        ]}
        budgetBrl={30}
        formatDay={(d) => d.slice(8)}
        formatMoney={(n) => `R$ ${n}`}
        summary="Maior gasto: R$ 2 em 28."
        budgetLabel="Orçamento diário"
        outOfScale="acima da escala do gráfico"
        columns={{ day: "Dia", cost: "Gasto" }}
      />,
    );
    expect(screen.getByRole("img", { name: "Gasto diário" })).toBeInTheDocument();
    expect(screen.getByText("Maior gasto: R$ 2 em 28.")).toBeInTheDocument();
    expect(screen.getByText(/acima da escala do gráfico/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Gasto diário" })).toHaveTextContent("R$ 2");
  });
});
