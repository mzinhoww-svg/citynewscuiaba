import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueRow } from "@/lib/db/queries/push-admin";
import { PushQueueTable } from "./PushQueueTable";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const decide = vi.fn();
const cancel = vi.fn();

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: "s1",
  kind: "urgent",
  status: "pending_approval",
  statusReason: null,
  title: "Chuva forte",
  body: "Defesa Civil alerta",
  originLabel: "ORIGINAL CITYNEWS",
  audience: { type: "all" },
  audienceLabel: "Todos que ativaram Urgentes",
  reach: 40,
  article: {
    id: "a1",
    slug: "chuva",
    title: "Chuva forte em Cuiabá",
    sectionSlug: "cidade",
    sectionName: "Cidade",
    publishedAt: "2026-09-29T12:00:00Z",
  },
  requestedBy: { id: "marina", name: "Marina Arruda" },
  requestedAt: "2026-09-29T14:00:00Z",
  approvedBy: null,
  approvedAt: null,
  scheduledAt: null,
  justification: "Alerta da Defesa Civil",
  version: 1,
  ...over,
});

beforeEach(() => {
  decide.mockReset();
  cancel.mockReset();
  refresh.mockReset();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("PushQueueTable (spec §10.3)", () => {
  it("aprovação em texto, não só cor; Recusar exige motivo", async () => {
    decide.mockResolvedValue({ ok: true, message: "Pedido recusado" });
    render(
      <PushQueueTable
        rows={[
          row(),
          row({
            id: "s2",
            status: "queued",
            title: "Destaque",
            approvedBy: { id: "helena", name: "Helena Costa" },
            approvedAt: "2026-09-29T17:32:00Z",
          }),
        ]}
        currentUserId="helena"
        canApprove
        canSettings
        decide={decide}
        cancel={cancel}
        pollMs={0}
      />,
    );
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toContain("Aprovação");
    expect(screen.getByText("Pendente")).toBeVisible();
    expect(screen.getByText(/Aprovado por Helena Costa às \d{2}:\d{2}/)).toBeVisible();
    expect(screen.getByText("Aguardando aprovação")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Aprovar Chuva forte" }));
    const dialog = screen.getByRole("dialog", { name: "Revisar pedido de aviso" });
    expect(within(dialog).getAllByText(/ORIGINAL CITYNEWS · Defesa Civil alerta/)).toHaveLength(3);
    expect(within(dialog).getByText("Alerta da Defesa Civil")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Recusar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar recusa" }));
    expect(decide).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Informe o motivo da recusa.")).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText("Motivo da recusa"), "não é urgente");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar recusa" }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries((decide.mock.calls[0]![0] as FormData).entries())).toEqual({
      id: "s1",
      decision: "reject",
      reason: "não é urgente",
    });
    expect(
      screen.getAllByRole("status").some((s) => s.textContent?.includes("Pedido recusado")),
    ).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("quem pediu vê o aviso e não aprova; cancelar só para quem pediu ou push.settings; erro fica no diálogo", async () => {
    decide.mockResolvedValue({ ok: false, message: "A aprovação precisa ser de outra pessoa." });
    render(
      <PushQueueTable
        rows={[
          row(),
          row({ id: "s3", title: "Outro", requestedBy: { id: "helena", name: "Helena Costa" } }),
        ]}
        currentUserId="marina"
        canApprove={false}
        canSettings={false}
        decide={decide}
        cancel={cancel}
        pollMs={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancelar Chuva forte" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancelar Outro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprovar Outro" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Aprovar Chuva forte" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("A aprovação precisa ser de outra pessoa.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Aprovar" })).toBeDisabled();
  });

  it("vazio explica; contagem anunciada só quando muda", async () => {
    const { rerender } = render(
      <PushQueueTable
        rows={[]}
        currentUserId="x"
        canApprove
        canSettings
        decide={decide}
        cancel={cancel}
        pollMs={0}
      />,
    );
    expect(screen.getByText("Nenhum pedido na fila.")).toBeVisible();
    rerender(
      <PushQueueTable
        rows={[row()]}
        currentUserId="x"
        canApprove
        canSettings
        decide={decide}
        cancel={cancel}
        pollMs={0}
      />,
    );
    await waitFor(() => expect(screen.getByText("1 item na fila")).toBeInTheDocument());
  });
});
