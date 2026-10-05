import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { DecisionPanel, type DecisionPanelProps } from "./DecisionPanel";

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
});

function setup(over: Partial<DecisionPanelProps> = {}) {
  const approve = vi.fn().mockResolvedValue({ ok: true, message: "Aprovada e publicada" });
  const props: DecisionPanelProps = {
    articleId: "a1",
    recommended: { label: "Publicar", rationale: "Fonte confiável" },
    human: null,
    editHref: "/estudio/materias/a1",
    actions: {
      approve,
      reject: vi.fn(),
      requestChanges: vi.fn(),
      reprocess: vi.fn(),
    },
    ...over,
  };
  render(<DecisionPanel {...props} />);
  return { approve };
}

describe("DecisionPanel · atalhos (UX-W3-T5, item 53)", () => {
  it("a aprova como o botão; r abre Pedir ajuste com motivo (sem pular a confirmação)", async () => {
    const user = userEvent.setup();
    const { approve } = setup();
    await user.keyboard("a");
    expect(approve).toHaveBeenCalledWith({ id: "a1" });
    // Com a aprovação em andamento os atalhos ficam travados (como os botões): espera terminar.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Aprovar e publicar" })[0]).toBeEnabled(),
    );

    await user.keyboard("r");
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(within(dialog).getByRole("heading", { hidden: true })).toHaveTextContent("Pedir ajuste");
  });

  it("com checklist incompleto, a não aprova", async () => {
    const user = userEvent.setup();
    const { approve } = setup({ blocker: "Falta a fonte" });
    await user.keyboard("a");
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("DecisionPanel · ações ao alcance (UX-W3-T1, item 45)", () => {
  it("abaixo de xl, Aprovar e Pedir ajuste ficam numa barra fixa no rodapé com área segura", () => {
    setup();
    const bar = screen.getByRole("group", { name: "Decisão" });
    expect(bar).toHaveClass(
      "max-xl:fixed",
      "max-xl:inset-x-0",
      "max-xl:bottom-0",
      "max-xl:z-sticky",
      "max-xl:pb-safe",
    );
    expect(within(bar).getByRole("button", { name: "Aprovar e publicar" })).toBeEnabled();
    expect(within(bar).getByRole("button", { name: "Pedir ajuste" })).toBeVisible();
  });

  it("o menu 'Mais ações' (só abaixo de xl) leva Reprocessar, Rejeitar e Abrir no editor", async () => {
    setup();
    const more = screen.getByRole("button", { name: "Mais ações" });
    expect(more.closest(".xl\\:hidden")).not.toBeNull();
    await userEvent.click(more);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Reprocessar" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Rejeitar" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Abrir no editor" })).toBeVisible();
  });
});

describe("DecisionPanel · revisão em sequência (UX-W3-T1, item 46)", () => {
  const next = "/estudio/fila/a2?de=%2Festudio%2Ffila%3Faba%3Dexceptions";

  it("'Aprovar e ir para o próximo' aprova e navega para o próximo, com a origem", async () => {
    const { approve } = setup({ nextHref: next });
    await userEvent.click(screen.getByRole("button", { name: "Aprovar e ir para o próximo" }));
    expect(approve).toHaveBeenCalledWith({ id: "a1" });
    expect(push).toHaveBeenCalledWith(next);
  });

  it("falha na aprovação não navega e mostra a mensagem", async () => {
    const approve = vi.fn().mockResolvedValue({ ok: false, message: "Escolha a editoria" });
    setup({ nextHref: next, actions: { approve } });
    await userEvent.click(screen.getByRole("button", { name: "Aprovar e ir para o próximo" }));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText("Escolha a editoria")).toBeVisible();
  });

  it("sem próximo, o botão não aparece", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Aprovar e ir para o próximo" })).toBeNull();
  });

  it("checklist incompleto desabilita as duas formas de aprovar", () => {
    setup({ nextHref: next, blocker: "falta a fonte principal" });
    expect(screen.getByRole("button", { name: "Aprovar e publicar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aprovar e ir para o próximo" })).toBeDisabled();
  });
});
