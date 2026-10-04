import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PublishDialog } from "./PublishDialog";

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const base = { articleId: "a1", labels: [], hasTopic: false };

describe("PublishDialog · push urgente (E06, spec §10.7)", () => {
  it("Push urgente só aparece habilitado para quem pode pedir urgente", async () => {
    const { unmount } = render(<PublishDialog {...base} publish={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    const box = screen.getByRole("checkbox", { name: "Push urgente" });
    expect(box).toBeDisabled();
    expect(screen.getByText("Push urgente é só para admin ou editor-chefe.")).toBeVisible();
    unmount();
    render(<PublishDialog {...base} canRequestUrgent publish={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByRole("checkbox", { name: "Push urgente" })).toBeEnabled();
    // Agendar desliga o push (urgente só sai agora).
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    expect(screen.getByRole("checkbox", { name: "Push urgente" })).toBeDisabled();
  });

  it("marcado exige justificativa; publica com o pedido e mostra o link para a fila", async () => {
    const publish = vi.fn().mockResolvedValue({
      ok: true,
      message:
        "Matéria publicada. Push urgente aprovado e na fila de envio. Fica registrado no histórico.",
      pushQueueHref: "/estudio/admin/notificacoes/fila",
    });
    render(<PublishDialog {...base} canRequestUrgent publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Push urgente" }));
    const just = screen.getByRole("textbox", { name: "Justificativa do push" });
    expect(just).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Informe a justificativa do push urgente.");
    await userEvent.type(just, "Alerta da Defesa Civil");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    expect(publish).toHaveBeenCalledWith({
      id: "a1",
      when: "now",
      destinations: ["home", "section"],
      push: { justification: "Alerta da Defesa Civil" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Push urgente aprovado e na fila de envio",
    );
    expect(screen.getByRole("link", { name: "Ver fila de notificações" })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes/fila",
    );
  });

  it("sem marcar, publica como antes (sem `push`)", async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true, message: "Matéria publicada" });
    render(<PublishDialog {...base} canRequestUrgent publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    expect(publish).toHaveBeenCalledWith({
      id: "a1",
      when: "now",
      destinations: ["home", "section"],
    });
  });
});
