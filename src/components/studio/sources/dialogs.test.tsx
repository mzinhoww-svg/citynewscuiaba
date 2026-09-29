import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApproveChangeDialog } from "./ApproveChangeDialog";
import { BlockSourceDialog } from "./BlockSourceDialog";
import { ConfirmByTypingDialog } from "./ConfirmByTypingDialog";

// jsdom não implementa `showModal`: abre o `<dialog>` para o conteúdo entrar na árvore acessível.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("ConfirmByTypingDialog", () => {
  it("só confirma com o nome exato e o motivo preenchido", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmByTypingDialog open name="Brasil Hoje" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );
    const confirm = screen.getByRole("button", { name: "Excluir fonte" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo"), "Fonte sem atualização");
    await userEvent.type(screen.getByLabelText("Digite Brasil Hoje para confirmar"), "Brasil hoje");
    expect(confirm).toBeDisabled();
    expect(screen.getByText("O nome digitado não confere.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Digite Brasil Hoje para confirmar"));
    await userEvent.type(screen.getByLabelText("Digite Brasil Hoje para confirmar"), "Brasil Hoje");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "Fonte sem atualização",
      typed: "Brasil Hoje",
    });
  });

  it("fonte ativa: explica que precisa pausar antes", () => {
    render(
      <ConfirmByTypingDialog
        open
        name="Brasil Hoje"
        blockedReason="Para excluir, pause ou bloqueie a fonte antes."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Para excluir, pause ou bloqueie a fonte antes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir fonte" })).toBeDisabled();
  });
});

describe("BlockSourceDialog", () => {
  it("motivo obrigatório; Pedido do veículo explica a remoção das imagens", async () => {
    const onConfirm = vi.fn();
    render(<BlockSourceDialog open name="MT Agora" onCancel={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(screen.getByText("Escolha o motivo.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "Pedido do veículo" }));
    expect(screen.getByText(/remove todas as reproduções/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "opt_out", details: "" });
  });

  it("já bloqueada: só Pedido do veículo, para repetir a remoção", () => {
    render(
      <BlockSourceDialog
        open
        alreadyBlocked
        name="MT Agora"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Pedido do veículo" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Qualidade" })).toBeNull();
    expect(screen.getByText(/repete a remoção das reproduções/)).toBeInTheDocument();
  });
});

describe("ApproveChangeDialog", () => {
  const approval = {
    id: "a1",
    field: "image_policy",
    value: "reproduction",
    requestedBy: { id: "u1", name: "Diego Prado" },
    justification: "Acordo assinado",
    createdAt: "2026-09-28T12:00:00Z",
  };

  it("mostra o diff, quem pediu e a justificativa; aprovar e recusar com motivo", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ApproveChangeDialog
        open
        approval={approval}
        currentValue="none"
        onCancel={vi.fn()}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );
    expect(screen.getByText("política de imagem: nenhuma imagem → reprodução")).toBeInTheDocument();
    expect(screen.getByText("Diego Prado")).toBeInTheDocument();
    expect(screen.getByText("Acordo assinado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recusar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar recusa" }));
    expect(screen.getByText("Informe o motivo da recusa.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Motivo da recusa"), "Sem acordo");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar recusa" }));
    expect(onReject).toHaveBeenCalledWith("Sem acordo");
    // "Cancelar" volta do modo de recusa para as duas ações principais.
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Aprovar e aplicar" }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("pedido da própria pessoa avisa que a aprovação precisa ser de outra", () => {
    render(
      <ApproveChangeDialog
        open
        approval={approval}
        isOwnRequest
        onCancel={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Você fez este pedido: a aprovação precisa ser de outra pessoa."),
    ).toBeInTheDocument();
  });
});
