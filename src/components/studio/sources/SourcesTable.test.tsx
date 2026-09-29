import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceFilters as Filters, SourceListRow } from "@/lib/db/queries/sources-admin";
import { SourceApprovalsNotice, criticalValueLabel } from "./SourceApprovalsNotice";
import { SourceFilters } from "./SourceFilters";
import { SourcesTable } from "./SourcesTable";

vi.mock("server-only", () => ({}));
vi.mock("@/app/estudio/control/fontes/actions", () => ({
  bulkSourcesAction: vi.fn(async (fd: FormData) => ({
    ok: true,
    message: `${fd.getAll("ids").length} fontes alteradas.`,
    data: { batchId: "b", applied: fd.getAll("ids").length, skipped: 0, items: [] },
  })),
  collectNowAction: vi.fn(),
  sourceStatusAction: vi.fn(),
  setDefaultFrequencyAction: vi.fn(),
  setFastLaneMaxAction: vi.fn(),
}));

const filters = (over: Partial<Filters> = {}): Filters => ({
  q: "",
  status: [],
  layer: [],
  category: null,
  locality: null,
  reliability: null,
  via: null,
  health: null,
  archived: "no",
  sort: "name",
  dir: "asc",
  page: 1,
  ...over,
});

const row = (over: Partial<SourceListRow> = {}): SourceListRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  displayName: null,
  baseUrl: "https://folhadocerrado.example",
  status: "active",
  statusReason: null,
  archived: false,
  layer: 2,
  editorialScore: 4,
  reliability: "standard",
  locality: "cuiaba",
  categories: [],
  frequency: {
    chosen: null,
    effective: 30,
    raisedBy: null,
    lane: "normal",
    isDefault: true,
    defaultMinutes: 30,
  },
  nextCollectionAt: "2026-09-29T18:30:00Z",
  lastFetchedAt: null,
  lastError: null,
  consecutiveFailures: 0,
  operationalScore: 90,
  health: "saudavel",
  errors24h: 0,
  pendingApproval: false,
  version: 1,
  ...over,
});

const two = [
  row(),
  row({
    id: "22222222-2222-4222-8222-222222222222",
    slug: "mt-agora",
    name: "MT Agora",
    status: "paused",
    statusReason: "auto_failures",
    editorialScore: 3,
  }),
];

describe("SourcesTable", () => {
  it("estado, relevância e saúde em texto, cabeçalhos com scope e aria-sort", () => {
    render(<SourcesTable rows={two} filters={filters({ sort: "score", dir: "desc" })} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pausada")).toBeVisible();
    expect(within(table).getByText(/Pausa automática por falhas/)).toBeVisible();
    expect(within(table).getByText("4 de 5")).toBeVisible();
    expect(within(table).getAllByText("Saudável")).toHaveLength(2);
    const heads = within(table).getAllByRole("columnheader");
    for (const h of heads) expect(h).toHaveAttribute("scope", "col");
    expect(within(table).getByRole("columnheader", { name: "Saúde" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(within(table).getByRole("columnheader", { name: "Fonte" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("frequência mostra quem elevou e o padrão", () => {
    render(
      <SourcesTable
        rows={[
          row({
            frequency: {
              chosen: 30,
              effective: 60,
              raisedBy: "robots",
              lane: "normal",
              isDefault: false,
              defaultMinutes: 30,
            },
          }),
        ]}
        filters={filters()}
      />,
    );
    expect(within(screen.getByRole("table")).getByText("1 h (robots)")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText(/Crawl-delay/)).toBeVisible();
  });

  it("cada fonte leva à página da fonte", () => {
    render(<SourcesTable rows={two} filters={filters()} />);
    const link = within(screen.getByRole("table")).getByRole("link", { name: "MT Agora" });
    expect(link).toHaveAttribute(
      "href",
      "/estudio/control/fontes/22222222-2222-4222-8222-222222222222",
    );
  });

  it("seleção mostra a contagem e o lote pede confirmação com a contagem", async () => {
    const user = userEvent.setup();
    render(<SourcesTable rows={two} filters={filters()} />);
    const table = screen.getByRole("table");
    expect(screen.getByText(/Selecione fontes/)).toBeInTheDocument();
    await user.click(within(table).getByRole("checkbox", { name: "Selecionar Folha do Cerrado" }));
    await user.click(within(table).getByRole("checkbox", { name: "Selecionar MT Agora" }));
    expect(screen.getByText("2 fontes selecionadas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar" }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    await user.click(within(dialog).getByRole("button", { name: "Pausar 2 fontes", hidden: true }));
    expect(await screen.findByText("2 fontes alteradas.")).toBeInTheDocument();
    expect(screen.getByText(/Selecione fontes/)).toBeInTheDocument();
  });

  it("ações da linha seguem o estado: pausar e coletar só para ativa", () => {
    render(<SourcesTable rows={two} filters={filters()} />);
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("button", { name: "Coletar agora: Folha do Cerrado" }),
    ).toBeVisible();
    expect(within(table).getByRole("button", { name: "Pausar Folha do Cerrado" })).toBeVisible();
    expect(within(table).getByRole("button", { name: "Reativar MT Agora" })).toBeVisible();
    expect(within(table).queryByRole("button", { name: "Coletar agora: MT Agora" })).toBeNull();
  });
});

describe("SourceFilters", () => {
  it("é um formulário GET com o estado atual e limpar filtros", () => {
    render(<SourceFilters filters={filters({ status: ["active"], sort: "score", dir: "desc" })} />);
    const form = screen.getByRole("form", { name: "Filtros da lista de fontes" });
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("Estado")).toHaveValue("active");
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute(
      "href",
      "/estudio/control/fontes?ordem=score&dir=desc",
    );
    expect(form.querySelector("input[name=ordem]")).toHaveValue("score");
  });

  it("sem filtro não mostra limpar", () => {
    render(<SourceFilters filters={filters()} />);
    expect(screen.queryByRole("link", { name: "Limpar filtros" })).toBeNull();
  });
});

describe("SourceApprovalsNotice", () => {
  const a = (i: number) => ({
    id: `a${i}`,
    kind: "source.critical",
    targetRef: "x",
    justification: "j",
    requestedBy: "u",
    requestedAt: "2026-09-29T12:00:00Z",
    sourceId: `33333333-3333-4333-8333-33333333333${i}`,
    sourceName: `Portal Várzea ${i}`,
    requesterName: "Diego Prado",
    field: "image_policy",
    value: "reproduction",
  });

  it("nada a mostrar sem pedidos", () => {
    const { container } = render(<SourceApprovalsNotice approvals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lista fonte, campo, valor legível e quem pediu; limita e conta o resto", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<SourceApprovalsNotice approvals={[1, 2, 3, 4].map(a) as any} limit={2} />);
    expect(screen.getByText("4 mudanças críticas aguardam segunda aprovação")).toBeInTheDocument();
    expect(screen.getAllByText(/Política de imagem: Reprodução com crédito/)).toHaveLength(2);
    expect(screen.getAllByText(/pedido por Diego Prado/)).toHaveLength(2);
    expect(screen.getByText("e mais 2 pedidos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver aprovações" })).toHaveAttribute(
      "href",
      "/estudio/control/aprovacoes",
    );
  });

  it("valores legíveis por campo", () => {
    expect(criticalValueLabel("may_be_sole_source", "true")).toBe("Sim");
    expect(criticalValueLabel("reliability", "primary")).toBe("Fonte primária");
    expect(criticalValueLabel("status", "paused")).toMatch(/Desbloquear/);
    expect(criticalValueLabel("outro", "x")).toBe("x");
  });
});
