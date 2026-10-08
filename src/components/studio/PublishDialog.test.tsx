import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Informe a justificativa do push urgente.")).toHaveAttribute(
      "role",
      "alert",
    );
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

describe("PublishDialog · edição não salva (item 4, E-02)", () => {
  it("com edição pendente, o diálogo oferece Salvar e publicar", async () => {
    render(
      <PublishDialog
        {...base}
        publish={vi.fn()}
        dirty
        onSaveFirst={vi.fn().mockResolvedValue(true)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByRole("button", { name: "Salvar e publicar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar publicação" })).not.toBeInTheDocument();
    expect(screen.getByText(/alterações não salvas/i)).toBeInTheDocument();
  });

  it("salva antes e só então publica", async () => {
    const order: string[] = [];
    const save = vi.fn(async () => {
      order.push("save");
      return true;
    });
    const publish = vi.fn(async () => {
      order.push("publish");
      return { ok: true, message: "Matéria publicada" };
    });
    render(<PublishDialog {...base} publish={publish} dirty onSaveFirst={save} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar e publicar" }));
    expect(order).toEqual(["save", "publish"]);
  });

  it("se salvar falhar, não publica e avisa", async () => {
    const publish = vi.fn();
    render(
      <PublishDialog
        {...base}
        publish={publish}
        dirty
        onSaveFirst={vi.fn().mockResolvedValue(false)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar e publicar" }));
    expect(publish).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nada foi publicado");
  });

  it("com edição pendente e sem como salvar, não publica a versão antiga", async () => {
    const publish = vi.fn();
    render(<PublishDialog {...base} publish={publish} dirty />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar e publicar" }));
    expect(publish).not.toHaveBeenCalled();
  });

  it("agendar com edição pendente vira Salvar e agendar", async () => {
    render(
      <PublishDialog
        {...base}
        publish={vi.fn()}
        dirty
        onSaveFirst={vi.fn().mockResolvedValue(true)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    expect(screen.getByRole("button", { name: "Salvar e agendar" })).toBeInTheDocument();
  });
});

describe("PublishDialog · validação (item 49, E-19)", () => {
  const field = () => screen.getByLabelText("Data e hora (fuso de Cuiabá)");

  it("o campo de agendamento começa em agora (fuso de Cuiabá)", async () => {
    render(<PublishDialog {...base} publish={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    expect(field()).toHaveAttribute(
      "min",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    );
  });

  it("agendar no passado mostra erro ligado ao campo e não envia", async () => {
    const publish = vi.fn();
    render(<PublishDialog {...base} publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    fireEvent.change(field(), { target: { value: "2020-01-01T10:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
    expect(publish).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(
      expect.stringContaining("Escolha um horário futuro"),
    );
  });

  it("agendar sem data também fica no campo", async () => {
    const publish = vi.fn();
    render(<PublishDialog {...base} publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
    expect(publish).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("agendar no futuro envia o horário", async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true, message: "Matéria agendada" });
    render(<PublishDialog {...base} publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const at = `${soon.getUTCFullYear()}-${String(soon.getUTCMonth() + 1).padStart(2, "0")}-${String(soon.getUTCDate()).padStart(2, "0")}T10:00`;
    fireEvent.change(field(), { target: { value: at } });
    await userEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ when: { at } }));
  });

  it("desmarcar todos os destinos desabilita Publicar e diz por quê", async () => {
    const publish = vi.fn();
    render(<PublishDialog {...base} publish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Home" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Editoria" }));
    const confirm = screen.getByRole("button", { name: "Confirmar publicação" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("Escolha ao menos um destino.");
    await userEvent.click(screen.getByRole("checkbox", { name: "Newsletter" }));
    expect(screen.getByRole("button", { name: "Confirmar publicação" })).toBeEnabled();
  });
});
