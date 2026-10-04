import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingSourceApproval } from "@/lib/db/queries/sources-admin";
import type { ActionFn } from "@/lib/sources/action-state";
import { CollectionActions } from "./CollectionActions";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";
import { SourceHeaderActions } from "./SourceHeaderActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => "/estudio/control/fontes/abc",
}));

// jsdom não implementa `showModal`: abre o `<dialog>` para o conteúdo entrar na árvore acessível.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  refresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const ok = (message = "Feito"): ReturnType<typeof vi.fn<ActionFn>> =>
  vi.fn<ActionFn>(async () => ({ ok: true, message }));

describe("PendingApprovalsPanel", () => {
  const approval: PendingSourceApproval = {
    id: "a1b2c3d4-0000-4000-8000-000000000000",
    sourceId: "abc",
    sourceName: "Folha do Cerrado",
    field: "image_policy",
    value: "reproduction",
    requestedBy: { id: "u-diego", name: "Diego Prado" },
    justification: "Acordo assinado em 27/09",
    createdAt: "2026-09-28T12:00:00Z",
  };

  it("sem pedidos não renderiza nada", () => {
    const { container } = render(
      <PendingApprovalsPanel approvals={[]} currentValues={{}} canApprove action={ok()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("quem não pode aprovar só lê: linha do pedido sem Revisar", () => {
    render(
      <PendingApprovalsPanel
        approvals={[approval]}
        currentValues={{ image_policy: "none" }}
        canApprove={false}
        action={ok()}
      />,
    );
    expect(
      screen.getByRole("region", { name: "1 alteração aguarda aprovação" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pedido por Diego Prado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar" })).toBeNull();
  });

  it("Revisar abre o diálogo com o diff; aprovar envia id e decisão e atualiza a tela", async () => {
    const action = ok("Mudança aplicada");
    render(
      <PendingApprovalsPanel
        approvals={[approval]}
        currentValues={{ image_policy: "none" }}
        canApprove
        action={action}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Diego Prado");
    expect(dialog).toHaveTextContent("Acordo assinado em 27/09");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aprovar e aplicar" }));
    const form = action.mock.calls[0]![0];
    expect(form.get("id")).toBe(approval.id);
    expect(form.get("decision")).toBe("approve");
    expect(form.get("reason")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Mudança aplicada");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("falha da ação fica no diálogo (não fecha) e não atualiza a tela", async () => {
    const action = vi.fn<ActionFn>(async () => ({
      ok: false,
      message: "Este pedido já foi decidido.",
    }));
    render(
      <PendingApprovalsPanel
        approvals={[approval]}
        currentValues={{ image_policy: "none" }}
        canApprove
        action={action}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.click(screen.getByRole("button", { name: "Aprovar e aplicar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Este pedido já foi decidido.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("SourceHeaderActions", () => {
  const source = {
    id: "abc",
    version: 4,
    name: "Folha do Cerrado",
    status: "active" as const,
    statusReason: null,
    archived: false,
  };

  it("fonte ativa: Coletar agora, Pausar, Bloquear e Excluir; Pausar envia id, versão e ação", async () => {
    const statusAction = ok("Fonte pausada");
    render(
      <SourceHeaderActions source={source} statusAction={statusAction} collectNowAction={ok()} />,
    );
    const group = screen.getByRole("group", { name: "Ações da fonte" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Coletar agora", "Pausar", "Bloquear", "Excluir fonte"]);
    await userEvent.click(within(group).getByRole("button", { name: "Pausar" }));
    const form = statusAction.mock.calls[0]![0];
    expect(form.get("id")).toBe("abc");
    expect(form.get("version")).toBe("4");
    expect(form.get("action")).toBe("pause");
    expect(await screen.findByRole("status")).toHaveTextContent("Fonte pausada");
    expect(refresh).toHaveBeenCalled();
  });

  it("pausada aguardando ativação mostra Ativar; bloqueada mostra Bloquear de novo e Desbloquear; arquivada só Restaurar", () => {
    const { rerender } = render(
      <SourceHeaderActions
        source={{ ...source, status: "paused", statusReason: "pending_activation" }}
        statusAction={ok()}
        collectNowAction={ok()}
      />,
    );
    expect(screen.getByRole("button", { name: "Ativar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coletar agora" })).toBeNull();
    rerender(
      <SourceHeaderActions
        source={{ ...source, status: "blocked", statusReason: "opt_out" }}
        statusAction={ok()}
        collectNowAction={ok()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Bloquear de novo (Pedido do veículo)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desbloquear" })).toBeInTheDocument();
    rerender(
      <SourceHeaderActions
        source={{ ...source, status: "paused", archived: true }}
        statusAction={ok()}
        collectNowAction={ok()}
      />,
    );
    const group = screen.getByRole("group", { name: "Ações da fonte" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Restaurar fonte"]);
  });

  it("Excluir fonte pede o nome digitado e envia motivo + confirmação; fonte ativa fica travada", async () => {
    const statusAction = ok("Fonte arquivada");
    render(
      <SourceHeaderActions
        source={{ ...source, status: "paused", statusReason: "manual" }}
        statusAction={statusAction}
        collectNowAction={ok()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Excluir fonte" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Motivo"), "Sem atualização");
    await userEvent.type(
      within(dialog).getByLabelText("Digite Folha do Cerrado para confirmar"),
      "Folha do Cerrado",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Excluir fonte" }));
    const form = statusAction.mock.calls[0]![0];
    expect(form.get("action")).toBe("archive");
    expect(form.get("reason")).toBe("Sem atualização");
    expect(form.get("confirmName")).toBe("Folha do Cerrado");
    expect(await screen.findByRole("status")).toHaveTextContent("Fonte arquivada");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("conflito de versão (code=conflict) oferece Recarregar; outra falha não", async () => {
    const { rerender } = render(
      <SourceHeaderActions
        source={source}
        statusAction={vi.fn<ActionFn>(async () => ({
          ok: false,
          code: "conflict",
          message: "Esta fonte foi alterada por outra pessoa. Recarregue para ver a versão atual.",
        }))}
        collectNowAction={ok()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    let alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    rerender(
      <SourceHeaderActions
        source={{ ...source, id: "outra" }}
        statusAction={vi.fn<ActionFn>(async () => ({
          ok: false,
          message: "Serviço indisponível. Recarregue e tente de novo.",
        }))}
        collectNowAction={ok()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Serviço indisponível");
    expect(within(alert).queryByRole("button", { name: "Recarregar" })).toBeNull();
  });
});

describe("CollectionActions", () => {
  it("Testar conexão envia o id, mostra o resultado e não inicia atualização periódica", async () => {
    const testAction = ok("Conexão ok: 12 itens, 1,2 s");
    render(
      <CollectionActions
        sourceId="abc"
        canCollectNow={false}
        testAction={testAction}
        collectNowAction={ok()}
        reanalyzeHref="/estudio/control/fontes/nova?url=https%3A%2F%2Fx"
      />,
    );
    expect(screen.queryByRole("button", { name: "Coletar agora" })).toBeNull();
    expect(screen.getByRole("link", { name: "Reanalisar link" })).toHaveAttribute(
      "href",
      "/estudio/control/fontes/nova?url=https%3A%2F%2Fx",
    );
    await userEvent.click(screen.getByRole("button", { name: "Testar conexão" }));
    expect(testAction.mock.calls[0]![0].get("id")).toBe("abc");
    expect(await screen.findByRole("status")).toHaveTextContent("Conexão ok: 12 itens, 1,2 s");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Coletar agora atualiza a tela na hora e depois a cada 5 s, por até 12 vezes", async () => {
    // Relógio falso que ainda anda sozinho: o `findBy*` da Testing Library continua funcionando
    // e o `advanceTimersByTimeAsync` salta as esperas de 5 s.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    {
      render(
        <CollectionActions
          sourceId="abc"
          canCollectNow
          testAction={ok()}
          collectNowAction={ok("Coleta enfileirada")}
          reanalyzeHref="/nova"
        />,
      );
      await user.click(screen.getByRole("button", { name: "Coletar agora" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Coleta enfileirada");
      expect(refresh).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(refresh).toHaveBeenCalledTimes(2);
      // Cada disparo agenda o próximo só depois de renderizar: avança de 5 s em 5 s.
      for (let i = 0; i < 20; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000);
        });
      }
      // 1 (na hora) + 12 (a cada 5 s) e para.
      expect(refresh).toHaveBeenCalledTimes(13);
    }
  });

  it("falha do Coletar agora mostra alerta e não atualiza a tela", async () => {
    render(
      <CollectionActions
        sourceId="abc"
        canCollectNow
        testAction={ok()}
        collectNowAction={vi.fn<ActionFn>(async () => ({
          ok: false,
          message: "Aguarde antes de coletar de novo.",
        }))}
        reanalyzeHref="/nova"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Coletar agora" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Aguarde antes de coletar de novo.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
