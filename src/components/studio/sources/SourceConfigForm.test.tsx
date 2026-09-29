import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceConfig } from "@/lib/sources/types";
import type { WizardAction } from "./AddSourceWizard";
import { SourceConfigForm, type SourceConfigFormProps } from "./SourceConfigForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const CONFIG: SourceConfig = {
  name: "Portal Várzea",
  displayName: null,
  slug: "portal-varzea",
  layer: 2,
  categories: ["cidade"],
  locality: "varzea-grande",
  reliability: "standard",
  imagePolicy: "none",
  republishPolicy: "link_only",
  maySoleSource: false,
  agreementUntil: null,
  agreementNote: null,
  termsUrl: null,
  strategy: "rss",
  baseUrl: "https://portalvarzea.example",
  feedUrl: "https://portalvarzea.example/feed",
  pageSelectors: null,
  frequencyMinutes: null,
  rateLimitPerHour: 20,
  termsMinIntervalMinutes: null,
  editorialScore: 3,
  priority: 2,
  recPinned: false,
  recLocalHighlight: false,
  recExcluded: false,
};

function setup(over: Partial<SourceConfigFormProps["source"]> = {}, action?: WizardAction) {
  const act =
    action ??
    vi.fn<WizardAction>(async () => ({
      ok: true,
      message: "Alterações salvas",
      data: { version: 8 },
    }));
  render(
    <SourceConfigForm
      source={{
        id: "c5000000-0000-4000-8000-000000000004",
        version: 7,
        config: CONFIG,
        status: "active",
        archived: false,
        lastFetchedAt: "2026-09-28T18:02:00Z",
        crawlDelaySec: null,
        termsReviewedAt: "2026-08-01T13:00:00Z",
        ownerName: null,
        ...over,
      }}
      defaultFrequency={30}
      fastLane={{ used: 0, max: 10 }}
      sections={[{ slug: "cidade", name: "Cidade" }]}
      action={act}
      now={new Date("2026-09-28T18:05:00Z")}
    />,
  );
  return act;
}

describe("SourceConfigForm", () => {
  it("frequência: padrão, via rápida (10, 15, 20) e ciclo normal; 25 e 45 não existem", () => {
    setup();
    const select = screen.getByLabelText("Frequência de coleta");
    expect(within(select).getByRole("option", { name: "Padrão (30 min)" })).toBeInTheDocument();
    const fast = select.querySelector('optgroup[label="Via rápida"]');
    expect(fast?.querySelectorAll("option")).toHaveLength(3);
    expect(select.querySelector('optgroup[label="Ciclo normal"]')).not.toBeNull();
    expect(within(select).queryByRole("option", { name: "25 min" })).toBeNull();
    expect(within(select).queryByRole("option", { name: "45 min" })).toBeNull();
    expect(within(select).getByRole("option", { name: "1 h 30" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Abaixo de 30 min a fonte entra na via rápida: coleta a cada 10 min, processamento no ciclo normal.",
      ),
    ).toBeInTheDocument();
  });

  it("10 min mostra a próxima coleta na janela de 10 min; 15 explica a grade", async () => {
    setup();
    const select = screen.getByLabelText("Frequência de coleta");
    await userEvent.selectOptions(select, "10");
    // Coletada às 14:02 (Cuiabá, UTC-4) com 10 min: próxima 14:10.
    expect(screen.getByText("Próxima coleta prevista: 14:10")).toBeInTheDocument();
    await userEvent.selectOptions(select, "15");
    expect(
      screen.getByText(
        "Coletas alinhadas à grade de 15 min: intervalos de 10 e 20 min, média de 15.",
      ),
    ).toBeInTheDocument();
  });

  it("fonte pausada: opções rápidas desabilitadas com o motivo em texto", () => {
    setup({ status: "paused" });
    const select = screen.getByLabelText("Frequência de coleta");
    for (const o of select.querySelectorAll('optgroup[label="Via rápida"] option'))
      expect(o).toBeDisabled();
    expect(screen.getByText("Ative a fonte antes de colocá-la na via rápida.")).toBeInTheDocument();
  });

  it("via rápida cheia desabilita com o número de vagas", () => {
    render(
      <SourceConfigForm
        source={{
          id: "x",
          version: 1,
          config: CONFIG,
          status: "active",
          archived: false,
          lastFetchedAt: null,
          crawlDelaySec: null,
          termsReviewedAt: null,
          ownerName: null,
        }}
        defaultFrequency={30}
        fastLane={{ used: 2, max: 2 }}
        sections={[]}
        action={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "A via rápida está cheia: 2 de 2 fontes. Tire outra fonte da via rápida ou peça para aumentar o limite.",
      ),
    ).toBeInTheDocument();
  });

  it("robots.txt eleva a frequência efetiva e a tela diz o motivo", async () => {
    setup({ crawlDelaySec: 900 });
    await userEvent.selectOptions(screen.getByLabelText("Frequência de coleta"), "10");
    expect(
      screen.getByText("Na via rápida, mas coletada a cada 30 min por causa do robots.txt."),
    ).toBeInTheDocument();
  });

  it("afrouxar política mostra Exige segunda aprovação e pede justificativa; restringir não", async () => {
    const act = setup({ config: { ...CONFIG, imagePolicy: "licensed_only" } });
    const policy = screen.getByLabelText("Política de imagem");
    await userEvent.selectOptions(policy, "none");
    expect(screen.queryByLabelText("Justificativa para a segunda aprovação")).toBeNull();
    await userEvent.selectOptions(policy, "reproduction");
    expect(screen.getAllByText("Exige segunda aprovação").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    // Sem justificativa, nem chama o servidor.
    expect(act).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Explique por que");
    await userEvent.type(
      screen.getByLabelText("Justificativa para a segunda aprovação"),
      "Acordo assinado em 27/09",
    );
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const form = (act as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FormData;
    expect(form.get("imagePolicy")).toBe("reproduction");
    expect(form.get("justification")).toBe("Acordo assinado em 27/09");
    expect(form.get("version")).toBe("7");
  });

  it("conflito de versão oferece Recarregar", async () => {
    setup(
      {},
      vi.fn<WizardAction>(async () => ({
        ok: false,
        message:
          "Esta fonte foi alterada por Helena Costa às 14:32. Recarregue para ver a versão atual.",
      })),
    );
    await userEvent.clear(screen.getByLabelText("Nome exibido"));
    await userEvent.type(screen.getByLabelText("Nome exibido"), "Várzea");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("alterada por Helena Costa");
    expect(within(alert).getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
  });

  it("arquivada abre em modo leitura", () => {
    setup({ archived: true, status: "paused" });
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
  });
});
