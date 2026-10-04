import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PushHomeCard } from "./PushHomeCard";
import { StaffUrgentOptIn } from "./StaffUrgentOptIn";

describe("PushHomeCard", () => {
  it("mostra fila, pendentes e última entrega com link para a tela", () => {
    render(
      <PushHomeCard
        data={{ queued: 2, pending: 3, lastDelivery: "03/10/2026, 10h" }}
        href="/estudio/admin/notificacoes"
      />,
    );
    expect(screen.getByRole("link", { name: /Abrir notificações push/ })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes",
    );
    expect(screen.getByText("Na fila").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Aguardando aprovação").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("03/10/2026, 10h")).toBeVisible();
  });

  it("sem entrega ainda diz isso; sem dados mostra o aviso mas mantém o link", () => {
    const { rerender } = render(
      <PushHomeCard data={{ queued: 0, pending: 0, lastDelivery: null }} href="/x" />,
    );
    expect(screen.getByText("Nenhuma ainda")).toBeVisible();
    rerender(<PushHomeCard data={null} href="/estudio/admin/notificacoes" />);
    expect(screen.getByText("O estado do push não carregou agora.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Abrir notificações push/ })).toBeVisible();
  });
});

describe("StaffUrgentOptIn", () => {
  it("navegador sem push: explica e não chama a ação", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(<StaffUrgentOptIn initialOn={false} action={action} />);
    await user.click(screen.getByRole("button", { name: "Ativar urgências" }));
    await waitFor(() =>
      expect(screen.getByText("Este navegador não recebe avisos.")).toBeVisible(),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("ligado: mostra o estado e desliga pela ação", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, on: false });
    const user = userEvent.setup();
    render(<StaffUrgentOptIn initialOn action={action} />);
    expect(screen.getByText("Urgências ativadas neste navegador")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Desativar urgências" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(false));
    expect(await screen.findByRole("button", { name: "Ativar urgências" })).toBeVisible();
  });
});
