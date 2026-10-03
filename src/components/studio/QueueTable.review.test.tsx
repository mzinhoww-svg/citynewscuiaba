import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { QueueTable, type QueueTableRow } from "./QueueTable";
import type { ForcedPublishApi, StatusReply } from "./ForcedPublishDialog";

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => vi.useRealTimers());

const row = (id: string, status: QueueTableRow["status"] = "in_review"): QueueTableRow => ({
  id,
  title: `Matéria ${id}`,
  href: `/estudio/fila/${id}`,
  sectionName: "Cidade",
  status,
  publishMode: null,
  confidence: "média",
  fromPipeline: true,
  aiFallback: false,
  sensitive: false,
  recommended: null,
  recommendedRationale: null,
  reviewReason: null,
  assigneeName: null,
  dueAt: null,
  overdue: false,
  canUnpublish: false,
});

const preview = {
  ok: true as const,
  total: 3,
  top: [
    { key: "single_source" as const, count: 2, example: "Obra na avenida" },
    { key: "no_photo" as const, count: 3, example: "Chuva forte" },
  ],
  excluded: [],
};

function setup(over: Partial<ForcedPublishApi> = {}, reviewTotal = 660) {
  const api: ForcedPublishApi = {
    preview: vi.fn().mockResolvedValue(preview),
    start: vi.fn().mockResolvedValue({ ok: true, jobId: "j1", total: 3 }),
    status: vi.fn().mockResolvedValue({
      ok: true,
      status: "done",
      total: 3,
      done: 3,
      failed: 0,
      excluded: [],
      failures: [],
    } satisfies StatusReply),
    ...over,
  };
  const assign = vi.fn();
  const utils = render(
    <QueueTable
      rows={[row("a"), row("b"), row("c"), row("p", "published")]}
      bulk={{
        assignees: [],
        assign,
        requestReview: vi.fn(),
        forcePublish: { reviewTotal, filter: { tab: "all", section: "cidade" }, api },
      }}
    />,
  );
  return { api, ...utils };
}

describe("fila de revisão · selecionar tudo", () => {
  it("o cabeçalho marca as em revisão da página e oferece 'todas as N'", async () => {
    setup();
    const header = screen.getByRole("checkbox", {
      name: "Selecionar todas as matérias em revisão desta página",
    });
    await userEvent.click(header);
    expect(screen.getByRole("checkbox", { name: 'Selecionar "Matéria a"' })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: 'Selecionar "Matéria p"' })).not.toBeChecked();
    expect(screen.getByText(/3 matérias selecionadas nesta página/)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Selecionar todas as 660 em revisão" }),
    );
    expect(screen.getByText(/Todas as 660 matérias em revisão estão selecionadas/)).toBeVisible();
    expect(screen.getByText(/660 selecionadas/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.getByRole("checkbox", { name: 'Selecionar "Matéria a"' })).not.toBeChecked();
  });

  it("sem outras páginas não oferece 'todas as N'; desmarcar uma linha tira o estado de tudo", async () => {
    setup({}, 3);
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    expect(screen.queryByRole("button", { name: /Selecionar todas as/ })).toBeNull();
  });

  it("'Publicar mesmo assim' fica desabilitado sem seleção", () => {
    setup();
    expect(screen.getByRole("button", { name: "Publicar mesmo assim" })).toBeDisabled();
  });
});

describe("Publicar mesmo assim · diálogo", () => {
  async function open(selectAll = false) {
    const ctx = setup();
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    if (selectAll)
      await userEvent.click(
        screen.getByRole("button", { name: "Selecionar todas as 660 em revisão" }),
      );
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    return ctx;
  }

  it("mostra o carregando e depois os maiores riscos com a frase de responsabilidade", async () => {
    let release: (v: typeof preview) => void = () => undefined;
    const { api } = setup({ preview: vi.fn().mockReturnValue(new Promise((r) => (release = r))) });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    expect(screen.getByText("Calculando os riscos da seleção…")).toBeVisible();
    await act(async () => release(preview));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("3 sem foto aprovada (publica com cartão tipográfico)"),
    ).toBeVisible();
    expect(within(dialog).getByText("2 de fonte única")).toBeVisible();
    expect(
      within(dialog).getByText(
        /Você assume a responsabilidade pela publicação destas matérias\. Dá para desfazer cada uma em um clique\./,
      ),
    ).toBeVisible();
    expect(api.preview).toHaveBeenCalledWith({ ids: ["a", "b", "c"] });
  });

  it("o foco inicial não cai em 'Publicar N matérias'", async () => {
    await open();
    const publish = await screen.findByRole("button", { name: "Publicar 3 matérias" });
    expect(publish).not.toHaveFocus();
  });

  it("Cancelar fecha sem publicar nada; Esc também", async () => {
    const { api } = await open();
    await screen.findByRole("button", { name: "Publicar 3 matérias" });
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    await screen.findByRole("button", { name: "Publicar 3 matérias" });
    await userEvent.keyboard("{Escape}");
    // jsdom não fecha <dialog> com Esc sozinho: o evento cancel do navegador vira close.
    await act(async () => {
      screen.getByRole("dialog").dispatchEvent(new Event("close"));
    });
    expect(api.start).not.toHaveBeenCalled();
  });

  it("confirmar chama a ação com os ids e mostra o resultado", async () => {
    const { api } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Publicar 3 matérias" }));
    expect(api.start).toHaveBeenCalledWith({ ids: ["a", "b", "c"] });
    expect(await screen.findByText("Publicando 0 de 3")).toBeVisible();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2100));
    });
    expect(await screen.findByText("3 matérias publicadas.")).toBeVisible();
    await userEvent.click(screen.getAllByRole("button", { name: "Fechar" }).at(-1)!);
    expect(refresh).toHaveBeenCalled();
  }, 10_000);

  it("com 'todas as N' envia o filtro, não os ids", async () => {
    const { api } = await open(true);
    await userEvent.click(await screen.findByRole("button", { name: "Publicar 3 matérias" }));
    expect(api.start).toHaveBeenCalledWith({ filter: { tab: "all", section: "cidade" } });
  });

  it("andamento atualiza e o resultado parcial lista as que ficaram de fora", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const status = vi
      .fn<ForcedPublishApi["status"]>()
      .mockResolvedValueOnce({
        ok: true,
        status: "running",
        total: 3,
        done: 1,
        failed: 0,
        excluded: [],
        failures: [],
      })
      .mockResolvedValue({
        ok: true,
        status: "done",
        total: 3,
        done: 2,
        failed: 0,
        excluded: [{ id: "c", title: "Matéria c", reason: "no_body" }],
        failures: [],
      });
    await act(async () => undefined);
    const { api } = setup({ status });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publicar 3 matérias" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.getByText("Publicando 1 de 3", { selector: "p" })).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.getByText("2 matérias publicadas; 1 ficou de fora.")).toBeVisible();
    expect(screen.getByText(/Matéria c/, { selector: "span" })).toBeVisible();
    expect(api.status).toHaveBeenCalledWith("j1");
  });

  it("erro ao calcular os riscos: mensagem e tentar de novo", async () => {
    const previewFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        message: "Não foi possível calcular os riscos. Tente de novo.",
      })
      .mockResolvedValue(preview);
    setup({ preview: previewFn });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    expect(
      await screen.findByText("Não foi possível calcular os riscos. Tente de novo."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("button", { name: "Publicar 3 matérias" })).toBeVisible();
  });

  it("seleção sem nada publicável (vazio) desabilita a confirmação", async () => {
    setup({
      preview: vi.fn().mockResolvedValue({
        ok: true,
        total: 0,
        top: [],
        excluded: [{ id: "a", title: "Matéria a", reason: "no_body" }],
      }),
    });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Selecionar todas as matérias em revisão desta página",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar mesmo assim" }));
    expect(await screen.findByText("Nenhuma matéria da seleção pode ser publicada.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publicar 0 matérias" })).toBeDisabled();
  });
});
