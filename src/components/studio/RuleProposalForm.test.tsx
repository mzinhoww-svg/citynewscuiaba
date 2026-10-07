import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { RuleProposalForm, type RuleSetDraft, type SimulationView } from "./RuleProposalForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const SIM: SimulationView = {
  changed: 2,
  total: 10,
  byRoute: { publish: [{ from: "publish", to: "review", count: 2 }] },
  diff: [{ path: "servicos.minSources", from: "2", to: "3" }],
};

function setup(
  over: {
    simulate?: (d: RuleSetDraft) => Promise<{
      ok: boolean;
      message: string;
      simulation?: SimulationView;
    }>;
    propose?: (i: {
      rules: RuleSetDraft;
      justification: string;
    }) => Promise<{ ok: boolean; message: string }>;
  } = {},
) {
  const simulate = vi.fn(
    over.simulate ?? (async () => ({ ok: true, message: "", simulation: SIM })),
  );
  const propose = vi.fn(
    over.propose ?? (async () => ({ ok: true, message: "Versão v2 aplicada." })),
  );
  render(<RuleProposalForm current={DEFAULT_RULES} simulate={simulate} propose={propose} />);
  return { simulate, propose, user: userEvent.setup() };
}

const simulateButton = () => screen.getByRole("button", { name: "Simular com os últimos 7 dias" });
const proposeButton = () => screen.getByRole("button", { name: "Propor versão" });

beforeEach(() => refresh.mockReset());

describe("RuleProposalForm · simular e propor", () => {
  it("começa da versão ativa e só libera Propor depois de simular", () => {
    setup();
    expect(screen.getByLabelText("Mín. fontes de Serviços")).toHaveValue(2);
    expect(
      screen.getByLabelText("Manter a revisão obrigatória (nada publica sozinho)"),
    ).toBeChecked();
    expect(proposeButton()).toBeDisabled();
    expect(
      screen.getByText("Simule antes de propor: a proposta leva o resultado da simulação."),
    ).toBeInTheDocument();
  });

  it("simula com a matriz editada, mostra quantos itens mudariam e propõe com a justificativa", async () => {
    const { simulate, propose, user } = setup();
    const min = screen.getByLabelText("Mín. fontes de Serviços");
    await user.clear(min);
    await user.type(min, "3");
    await user.click(simulateButton());

    expect(simulate).toHaveBeenCalledTimes(1);
    expect(simulate.mock.calls[0]![0].categories.servicos!.minSources).toBe(3);
    const result = await screen.findByRole("region", { name: "Resultado da simulação" });
    expect(result).toHaveTextContent("2 de 10 itens mudariam de destino.");
    expect(within(result).getByText("2 de publicar para revisão")).toBeInTheDocument();
    expect(within(result).getByText("servicos.minSources: 2 → 3")).toBeInTheDocument();
    // O resultado aparece antes de a simulação sair do estado ocupado.
    await waitFor(() => expect(proposeButton()).toBeEnabled());

    await user.type(screen.getByLabelText(/^Justificativa/), "  Mais uma fonte em serviços  ");
    await user.click(proposeButton());
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose.mock.calls[0]![0].justification).toBe("Mais uma fonte em serviços");
    expect(propose.mock.calls[0]![0].rules.sensitiveTopics).toEqual(DEFAULT_RULES.sensitiveTopics);
    expect(await screen.findByRole("status")).toHaveTextContent("Versão v2 aplicada.");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Depois de propor, uma nova proposta pede nova simulação.
    expect(proposeButton()).toBeDisabled();
  });

  it("mexer na matriz depois de simular descarta o resultado", async () => {
    const { user } = setup();
    await user.click(simulateButton());
    await screen.findByRole("region", { name: "Resultado da simulação" });
    await user.click(screen.getByLabelText("Exige primária de Serviços"));
    expect(screen.queryByRole("region", { name: "Resultado da simulação" })).toBeNull();
    expect(proposeButton()).toBeDisabled();
  });

  it("desligar a revisão obrigatória mostra o aviso de mudança crítica", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("Manter a revisão obrigatória (nada publica sozinho)"));
    expect(
      screen.getByText(/Desligar a revisão obrigatória é mudança crítica/),
    ).toBeInTheDocument();
  });
});

describe("RuleProposalForm · estados vazio e de erro", () => {
  it("simulação sem amostra e proposta igual à ativa dizem isso", async () => {
    const { user } = setup({
      simulate: async () => ({
        ok: true,
        message: "",
        simulation: { changed: 0, total: 0, byRoute: {}, diff: [] },
      }),
    });
    await user.click(simulateButton());
    const result = await screen.findByRole("region", { name: "Resultado da simulação" });
    expect(result).toHaveTextContent(
      "Nenhum item decidido nos últimos 7 dias: a simulação não tem amostra.",
    );
    expect(result).toHaveTextContent("A proposta é igual à versão ativa.");
    expect(within(result).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("falha da simulação vira alerta e Propor continua bloqueado", async () => {
    const { user } = setup({
      simulate: async () => ({ ok: false, message: "A proposta tem valores fora da faixa." }),
    });
    await user.click(simulateButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A proposta tem valores fora da faixa.",
    );
    expect(proposeButton()).toBeDisabled();
  });

  it("sem justificativa não envia; recusa do servidor vira alerta sem recarregar", async () => {
    const { propose, user } = setup({
      propose: async () => ({
        ok: false,
        message: "Uma versão nova foi proposta agora. Recarregue e tente de novo.",
      }),
    });
    await user.click(simulateButton());
    await screen.findByRole("region", { name: "Resultado da simulação" });
    // Vazia: o `required` do campo segura o envio.
    await user.click(proposeButton());
    expect(propose).not.toHaveBeenCalled();
    // Só espaços: passa no `required`, mas o formulário recusa.
    const field = screen.getByLabelText(/^Justificativa/);
    await user.type(field, "   ");
    await user.click(proposeButton());
    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Justificativa obrigatória.");

    await user.clear(field);
    await user.type(field, "Ajuste");
    await user.click(proposeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Uma versão nova foi proposta agora. Recarregue e tente de novo.",
    );
    expect(refresh).not.toHaveBeenCalled();
    // O resultado da simulação continua: dá para tentar de novo. O alerta aparece antes de a
    // transição terminar, então o botão volta um pouco depois.
    await waitFor(() => expect(proposeButton()).toBeEnabled());
  });
});
