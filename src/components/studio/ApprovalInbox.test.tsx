import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "@/lib/db/queries/approvals";
import { ApprovalInbox } from "./ApprovalInbox";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => refresh.mockReset());

const item = (over: Partial<ApprovalItem>): ApprovalItem => ({
  id: "a1",
  kind: "rules.activate",
  targetRef: "rules:4",
  target: { kind: "rules", version: 4 },
  justification: "Ajuste do limite",
  requestedBy: { id: "u1", name: "Marina" },
  approvedBy: { id: "u1", name: "Marina" },
  status: "applied",
  createdAt: "2026-10-01T12:00:00Z",
  decidedAt: "2026-10-01T12:05:00Z",
  ...over,
});

describe("ApprovalInbox · últimas decisões", () => {
  it("cartões abaixo de md e tabela a partir de md (a inativa fica display:none)", () => {
    render(
      <ApprovalInbox
        pending={[]}
        recent={[item({}), item({ id: "a2", status: "rejected", approvedBy: null })]}
        currentUserId="u1"
        decidable={[]}
        decide={vi.fn()}
      />,
    );
    // A seção e a região rolável da tabela têm o mesmo nome; a da tabela é a que embrulha <table>.
    const region = screen.getByRole("table").closest("[role=region]")!;
    expect(region.className).toMatch(/\bhidden\b/);
    expect(region.className).toContain("md:block");
    const cards = screen.getByRole("list", { name: "Últimas decisões" });
    expect(cards.className).toContain("md:hidden");
    const [applied, rejected] = within(cards).getAllByRole("listitem");
    expect(applied).toHaveTextContent("Aplicado");
    expect(applied).toHaveTextContent("Decidido por Marina");
    expect(rejected).toHaveTextContent("Recusado");
    expect(rejected).toHaveTextContent("Decidido por —");
  });
});

const pendingItem = (over: Partial<ApprovalItem> = {}) =>
  item({
    id: "p1",
    status: "pending",
    approvedBy: null,
    decidedAt: null,
    requestedBy: { id: "u2", name: "Diego" },
    justification: "Mais uma fonte em serviços",
    ...over,
  });

describe("ApprovalInbox · vazio", () => {
  it("sem pedidos e sem decisões, diz isso nas duas seções", () => {
    render(
      <ApprovalInbox pending={[]} recent={[]} currentUserId="u1" decidable={[]} decide={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Nenhum pedido aguardando" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Propostas de regras, prompts, pesos e papéis aparecem aqui assim que alguém pedir.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma decisão registrada ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Revisar" })).toBeNull();
  });
});

describe("ApprovalInbox · pedidos abertos", () => {
  it("aprovar e aplicar chama a decisão, mostra a confirmação e recarrega", async () => {
    const user = userEvent.setup();
    const decide = vi.fn(async () => ({
      ok: true,
      message: "Aplicado. Fica registrado no histórico.",
    }));
    render(
      <ApprovalInbox
        pending={[pendingItem()]}
        recent={[]}
        currentUserId="u1"
        decidable={["rules.activate"]}
        decide={decide}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "1 pedido aguarda decisão" }),
    ).toBeInTheDocument();
    expect(screen.getByText("regras v4")).toBeInTheDocument();
    expect(screen.getByText(/Pedido por Diego/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revisar" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveTextContent("Ativar regras de autonomia: regras v4");
    expect(dialog).toHaveTextContent("Mais uma fonte em serviços");
    await user.click(
      within(dialog).getByRole("button", { name: "Aprovar e aplicar", hidden: true }),
    );
    expect(decide).toHaveBeenCalledWith({ id: "p1", decision: "approve" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Aplicado. Fica registrado no histórico.",
    );
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recusar pede o motivo antes de enviar", async () => {
    const user = userEvent.setup();
    const decide = vi.fn(async () => ({ ok: true, message: "Pedido recusado." }));
    render(
      <ApprovalInbox
        pending={[pendingItem()]}
        recent={[]}
        currentUserId="u1"
        decidable={["rules.activate"]}
        decide={decide}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revisar" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await user.click(within(dialog).getByRole("button", { name: "Recusar", hidden: true }));
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar recusa", hidden: true }),
    );
    expect(decide).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Informe o motivo da recusa.");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Motivo da recusa/, hidden: true }),
      "Sem amostra suficiente",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar recusa", hidden: true }),
    );
    expect(decide).toHaveBeenCalledWith({
      id: "p1",
      decision: "reject",
      reason: "Sem amostra suficiente",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Pedido recusado.");
  });

  it("erro na decisão fica no diálogo, que continua aberto, e não recarrega", async () => {
    const user = userEvent.setup();
    const decide = vi.fn(async () => ({
      ok: false,
      message: "Não foi possível registrar a decisão. Tente de novo.",
    }));
    render(
      <ApprovalInbox
        pending={[pendingItem()]}
        recent={[]}
        currentUserId="u1"
        decidable={["rules.activate"]}
        decide={decide}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revisar" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await user.click(
      within(dialog).getByRole("button", { name: "Aprovar e aplicar", hidden: true }),
    );
    expect(await within(dialog).findByRole("alert", { hidden: true })).toHaveTextContent(
      "Não foi possível registrar a decisão. Tente de novo.",
    );
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pedido próprio é marcado; sem o papel, sem Revisar; fonte e push se decidem no alvo", () => {
    render(
      <ApprovalInbox
        pending={[
          pendingItem({ requestedBy: { id: "u1", name: "Marina" } }),
          pendingItem({
            id: "p2",
            kind: "source.critical",
            target: { kind: "source", sourceId: "s1", field: "tier", value: "nucleo" },
          }),
        ]}
        recent={[]}
        currentUserId="u1"
        decidable={[]}
        decide={vi.fn()}
      />,
    );
    const [own, source] = within(screen.getAllByRole("list")[0]!).getAllByRole("listitem");
    expect(own).toHaveTextContent("Seu pedido");
    expect(own).toHaveTextContent("Seu papel não decide este tipo de pedido");
    expect(within(own!).queryByRole("button")).toBeNull();
    expect(within(source!).getByRole("link", { name: "Revisar na fonte" })).toHaveAttribute(
      "href",
      "/estudio/control/fontes/s1",
    );
  });
});
