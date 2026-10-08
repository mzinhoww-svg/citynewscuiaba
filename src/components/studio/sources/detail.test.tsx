import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HistoryRow, SourceHealth, SourceRun } from "@/lib/db/queries/sources-admin";
import type { WizardAction } from "./AddSourceWizard";
import { SourceAuditTable, historyCsv } from "./SourceAuditTable";
import { SourceHealthPanel } from "./SourceHealthPanel";
import { SourceRecForm } from "./SourceRecForm";
import { SourceRunsTable } from "./SourceRunsTable";
import { SourceSectionNav } from "./SourceSectionNav";

let pathname = "/estudio/control/fontes/abc";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function health(over: Partial<SourceHealth> = {}): SourceHealth {
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    ok: i === 29 ? 2 : 4,
    notModified: 1,
    failed: i === 29 ? 2 : 0,
    itemsNew: i === 29 ? 3 : 6,
    avgLatencyMs: 800,
  }));
  return {
    days,
    score: 62,
    label: "atencao",
    components: { availability30: 0.94, errorRate24h: 0.5, freshness: "em_dia" },
    lastError: "Tempo esgotado ao buscar o feed",
    lastItemAt: "2026-09-28T17:00:00Z",
    ...over,
  };
}

describe("SourceSectionNav", () => {
  it("marca só a seção atual com aria-current=page", () => {
    pathname = "/estudio/control/fontes/abc/coleta";
    render(<SourceSectionNav basePath="/estudio/control/fontes/abc" />);
    const nav = screen.getByRole("navigation", { name: "Seções da fonte" });
    expect(within(nav).getByRole("link", { name: "Coleta e teste" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Resumo e saúde" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
  });
});

describe("SourceHealthPanel", () => {
  it("gráfico em SVG com resumo textual e componentes em texto", () => {
    render(
      <SourceHealthPanel
        health={health()}
        editorialScore={4}
        frequencyLabel="1 h"
        lastFetchedAt="2026-09-28T18:00:00Z"
        nextCollectionAt="2026-09-28T19:00:00Z"
        consecutiveFailures={2}
      />,
    );
    const figure = screen.getByRole("figure", { name: "Coletas nos últimos 30 dias" });
    expect(figure.querySelector("svg")).not.toBeNull();
    expect(
      screen.getByText(/Nos últimos 30 dias: 148 coletas ok, 2 com falha e 177 itens novos/),
    ).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("Atenção")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("Em dia")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "2 falhas seguidas. Na 3ª falha a fonte é pausada automaticamente.",
    );
  });

  it("sem coletas: 'Sem dados' e o texto de vazio no lugar do gráfico", () => {
    render(
      <SourceHealthPanel
        health={health({
          days: health().days.map((d) => ({ ...d, ok: 0, notModified: 0, failed: 0, itemsNew: 0 })),
          score: null,
          label: "sem_dados",
          components: { availability30: null, errorRate24h: null, freshness: "sem_itens" },
          lastError: null,
        })}
        editorialScore={3}
        frequencyLabel="30 min · padrão"
        lastFetchedAt={null}
        nextCollectionAt={null}
        consecutiveFailures={0}
      />,
    );
    expect(screen.getAllByText("Sem dados").length).toBeGreaterThan(0);
    expect(screen.getByText("Nenhuma coleta registrada nos últimos 30 dias.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SourceRunsTable", () => {
  it("mostra tipo e resultado em texto, inclusive o motivo quando pulada", () => {
    const runs: SourceRun[] = [
      {
        runId: "r1",
        trigger: "fast",
        startedAt: "2026-09-28T18:00:00Z",
        status: "ok",
        outcome: "ok",
      },
      {
        runId: "r2",
        trigger: "cron",
        startedAt: "2026-09-28T17:30:00Z",
        status: "ok",
        outcome: "not_modified",
      },
      {
        runId: "r3",
        trigger: "fast",
        startedAt: "2026-09-28T17:20:00Z",
        status: "ok",
        outcome: "skipped:fast_lane_full",
      },
      {
        runId: "r4",
        trigger: "manual",
        startedAt: "2026-09-28T17:10:00Z",
        status: "running",
        outcome: "pending",
      },
    ];
    render(<SourceRunsTable runs={runs} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByText("Via rápida")).toHaveLength(2);
    expect(within(table).getByText("Ciclo")).toBeInTheDocument();
    expect(within(table).getByText("Ok · sem novidade (304)")).toBeInTheDocument();
    expect(within(table).getByText("Pulada · via rápida cheia")).toBeInTheDocument();
    expect(within(table).getByText("Na fila")).toBeInTheDocument();
  });

  it("vazio explica", () => {
    render(<SourceRunsTable runs={[]} />);
    expect(screen.getByText("Nenhuma coleta registrada ainda.")).toBeInTheDocument();
  });
});

describe("SourceAuditTable", () => {
  const rows: HistoryRow[] = [
    {
      id: 10,
      at: "2026-09-28T12:12:00Z",
      actor: { id: "u1", name: "Diego Prado" },
      action: "source.update",
      changes: [{ field: "frequency_minutes", from: 30, to: 60 }],
      reason: "Menos carga",
      batchId: null,
      approvalId: null,
      details: {},
      ipHash: "abcd…",
    },
    {
      id: 9,
      at: "2026-09-27T21:40:00Z",
      actor: { id: "u2", name: "Marina Arruda" },
      action: "source.approval_applied",
      changes: [],
      reason: null,
      batchId: null,
      approvalId: "a1b2c3d4-0000-4000-8000-000000000000",
      details: { field: "republish_policy", to: "summary_2_sentences" },
      ipHash: null,
    },
  ];

  it("colunas, antes → depois e aprovação; CSV com IP mascarado", () => {
    render(
      <SourceAuditTable
        rows={rows}
        total={2}
        page={1}
        basePath="/estudio/control/fontes/abc/historico"
        filter=""
        slug="fonte"
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Diego Prado")).toBeInTheDocument();
    expect(within(table).getByText("frequência: 30 → 60")).toBeInTheDocument();
    expect(within(table).getByText("Menos carga")).toBeInTheDocument();
    expect(within(table).getByText("pedido a1b2c3d4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    const csv = historyCsv(rows);
    expect(csv.split("\n")[0]).toBe("quando;quem;o_que;antes_depois;motivo;aprovacao;ip_hash");
    expect(csv).toContain("abcd…");
    expect(csv).toContain("Marina Arruda");
  });

  it("C5-02: CSV neutraliza fórmula em nome e motivo", () => {
    const evil: HistoryRow[] = [
      {
        ...rows[0]!,
        actor: { id: "u3", name: '=HYPERLINK("https://mal","x")' },
        reason: "+1+1",
      },
      { ...rows[1]!, actor: { id: "u4", name: "@SUM(A1)" }, reason: "-2" },
    ];
    const lines = historyCsv(evil).split("\n").slice(1);
    for (const line of lines)
      for (const cell of line.split(";")) expect(cell).not.toMatch(/^"[=+\-@\t\r]/);
    expect(lines[0]).toContain(`"'=HYPERLINK(""https://mal"",""x"")"`);
    expect(lines[0]).toContain(`"'+1+1"`);
    expect(lines[1]).toContain(`"'@SUM(A1)"`);
  });

  it("filtro por tipo é um formulário GET com só `tipo`; trocar o tipo não navega", async () => {
    const href = window.location.href;
    render(
      <SourceAuditTable
        rows={[]}
        total={0}
        page={1}
        basePath="/x/historico"
        filter="source.update"
        slug="fonte"
      />,
    );
    const select = screen.getByLabelText("Tipo de alteração");
    const form = select.closest("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/x/historico");
    expect(select).toHaveAttribute("name", "tipo");
    expect(select).toHaveValue("source.update");
    // Mudar o tipo volta à página 1: o formulário não carrega `pagina`.
    expect(form.querySelector("[name='pagina']")).toBeNull();
    expect(within(form).getByRole("button", { name: "Filtrar" })).toHaveAttribute("type", "submit");
    expect(screen.getByText("Nenhuma alteração deste tipo.")).toBeInTheDocument();
    await userEvent.selectOptions(select, "");
    expect(select).toHaveValue("");
    expect(window.location.href).toBe(href);
  });

  it("paginação preserva o tipo e usa `pagina` só a partir da 2ª página", () => {
    render(
      <SourceAuditTable
        rows={rows}
        total={120}
        page={2}
        basePath="/x/historico"
        filter="source.update"
        slug="fonte"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Paginação do histórico" });
    expect(within(nav).getByRole("link", { name: "Página anterior" })).toHaveAttribute(
      "href",
      "/x/historico?tipo=source.update",
    );
    expect(within(nav).getByRole("link", { name: "Próxima página" })).toHaveAttribute(
      "href",
      "/x/historico?tipo=source.update&pagina=3",
    );
  });
});

describe("SourceRecForm", () => {
  it("envia só os três campos de recomendação com id e versão", async () => {
    const action = vi.fn<WizardAction>(async () => ({
      ok: true,
      message: "Alterações salvas",
      data: { version: 3 },
    }));
    render(
      <SourceRecForm
        source={{
          id: "abc",
          version: 2,
          name: "Folha do Cerrado",
          displayName: null,
          slug: "folha",
          logoUrl: null,
          locality: "cuiaba",
          categories: ["cidade"],
          recPinned: false,
          recLocalHighlight: true,
          recExcluded: false,
          archived: false,
        }}
        action={action}
      />,
    );
    await userEvent.click(screen.getByLabelText("Fixar nas recomendações"));
    await userEvent.click(screen.getByRole("button", { name: "Salvar recomendação" }));
    const form = action.mock.calls[0]![0];
    expect(form.get("id")).toBe("abc");
    expect(form.get("version")).toBe("2");
    expect(form.get("recPinned")).toBe("true");
    expect(form.get("recLocalHighlight")).toBe("true");
    expect(form.get("recExcluded")).toBe("false");
    expect(form.get("name")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Alterações salvas");
  });
});
