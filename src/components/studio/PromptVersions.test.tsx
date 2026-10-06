import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptVersions, type PromptVersionItem, type PromptVersionsProps } from "./PromptVersions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => refresh.mockReset());

const SYSTEM = "00000000-0000-0000-0000-000000000000";

const version = (over: Partial<PromptVersionItem>): PromptVersionItem => ({
  id: `p${over.version ?? 1}`,
  version: 1,
  status: "archived",
  body: "Resuma em duas frases.",
  rationale: "Versão inicial",
  author: { id: SYSTEM, name: null },
  approvedBy: [],
  createdAt: "2026-10-01T12:00:00Z",
  approval: null,
  ...over,
});

const VERSIONS: PromptVersionItem[] = [
  version({
    version: 3,
    status: "draft",
    body: "Resuma em três frases curtas.",
    rationale: "Resumo mais completo",
    author: { id: "u1", name: "Diego" },
  }),
  version({
    version: 2,
    status: "production",
    body: "Resuma em duas frases curtas.",
    rationale: "Frases curtas",
    author: { id: "u2", name: "Marina" },
    approvedBy: [{ id: "u2", name: "Marina" }],
  }),
  version({ version: 1, status: "archived" }),
];

function setup(over: Partial<PromptVersionsProps> = {}) {
  const props: PromptVersionsProps = {
    agentId: "write",
    versions: VERSIONS,
    currentUserId: "u1",
    canWrite: true,
    canApprove: false,
    request: vi.fn(async () => ({ ok: true, message: "Pedido de publicação registrado." })),
    publish: vi.fn(async () => ({ ok: true, message: "v3 em produção." })),
    rollback: vi.fn(async () => ({ ok: true, message: "Rollback feito." })),
    create: vi.fn(async () => ({ ok: true, message: "Rascunho v4 salvo." })),
    ...over,
  };
  render(<PromptVersions {...props} />);
  return { props, user: userEvent.setup() };
}

const row = (v: number) => screen.getByRole("rowheader", { name: `v${v}` }).closest("tr")!;

describe("PromptVersions · tabela e comparação", () => {
  it("lista situação, autor e assinaturas; compara uma versão com a produção", async () => {
    const { user } = setup();
    expect(row(2)).toHaveTextContent("Em produção");
    expect(row(2)).toHaveTextContent("Marina");
    expect(row(1)).toHaveTextContent("sistema (migration)");
    expect(row(3)).toHaveTextContent("Rascunho");
    // A produção não se compara com ela mesma.
    expect(within(row(2)).queryByRole("button", { name: /Comparar/ })).toBeNull();

    const compare = within(row(3)).getByRole("button", { name: "Comparar v3 com a produção" });
    await user.click(compare);
    expect(compare).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { level: 2, name: "Diferença entre v2 e v3" }),
    ).toBeInTheDocument();
    await user.click(compare);
    expect(screen.queryByRole("heading", { level: 2, name: "Diferença entre v2 e v3" })).toBeNull();
  });
});

describe("PromptVersions · publicar e voltar", () => {
  it("quem escreveu pede a publicação com justificativa (sem justificativa, alerta)", async () => {
    const { props, user } = setup();
    expect(within(row(2)).queryByRole("button", { name: /publicação/ })).toBeNull();
    await user.click(within(row(3)).getByRole("button", { name: "Pedir publicação da v3" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    const send = within(dialog).getByRole("button", {
      name: "Pedir publicação da v3",
      hidden: true,
    });
    await user.click(send);
    expect(props.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Explique por que esta versão deve ir para produção.",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /Justificativa para publicar/, hidden: true }),
      "Resumo mais completo na regressão",
    );
    await user.click(send);
    expect(props.request).toHaveBeenCalledWith({
      agentId: "write",
      version: 3,
      justification: "Resumo mais completo na regressão",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Pedido de publicação registrado.");
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sem o papel de aprovar, o pedido aberto mostra a espera; com ele, aprova e publica", async () => {
    const pending = VERSIONS.map((v) =>
      v.version === 3
        ? {
            ...v,
            status: "pending" as const,
            approval: { id: "ap1", status: "pending", requestedBy: "u1" },
          }
        : v,
    );
    setup({ versions: pending });
    expect(row(3)).toHaveTextContent("Aguarda admin ou editor-chefe.");
    expect(within(row(3)).queryByRole("button", { name: /publicar/ })).toBeNull();
    cleanup();

    const { props, user } = setup({ versions: pending, canApprove: true, currentUserId: "u2" });
    await user.click(within(row(3)).getByRole("button", { name: "Aprovar e publicar v3" }));
    expect(props.publish).toHaveBeenCalledWith({ approvalId: "ap1" });
    expect(await screen.findByRole("status")).toHaveTextContent("v3 em produção.");
  });

  it("rollback pede confirmação e volta para a versão escolhida", async () => {
    const { props, user } = setup({ canApprove: true });
    await user.click(within(row(1)).getByRole("button", { name: "Voltar para a v1" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveTextContent("Voltar para a v1 cria uma versão nova com o mesmo texto");
    await user.click(
      within(dialog).getByRole("button", { name: "Voltar para a v1", hidden: true }),
    );
    expect(props.rollback).toHaveBeenCalledWith({ agentId: "write", toVersion: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("Rollback feito.");
  });

  it("erro do servidor vira alerta e o diálogo continua aberto, sem recarregar", async () => {
    const { user } = setup({
      request: vi.fn(async () => ({ ok: false, message: "Só quem aprovou publica." })),
    });
    await user.click(within(row(3)).getByRole("button", { name: "Pedir publicação da v3" }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Justificativa para publicar/, hidden: true }),
      "Teste",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Pedir publicação da v3", hidden: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Só quem aprovou publica.");
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PromptVersions · nova versão e vazio", () => {
  it("nova versão parte do texto em produção e exige o motivo", async () => {
    const { props, user } = setup();
    const body = screen.getByRole("textbox", { name: /Texto da nova versão/ });
    expect(body).toHaveValue("Resuma em duas frases curtas.");
    const rationale = screen.getByRole("textbox", { name: /Motivo da mudança/ });
    await user.type(rationale, "   ");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(props.create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Descreva o motivo da mudança.");
    await user.clear(rationale);
    await user.type(rationale, " Tom mais direto ");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(props.create).toHaveBeenCalledWith({
      agentId: "write",
      body: "Resuma em duas frases curtas.",
      rationale: "Tom mais direto",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Rascunho v4 salvo.");
    expect(rationale).toHaveValue("");
  });

  it("sem versões: tabela sem linhas, sem ações, e o rascunho vazio não é enviado", async () => {
    const { props, user } = setup({ versions: [] });
    const table = screen.getByRole("table");
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
    expect(within(table).queryAllByRole("button")).toHaveLength(0);
    const body = screen.getByRole("textbox", { name: /Texto da nova versão/ });
    expect(body).toHaveValue("");
    await user.type(body, "   ");
    await user.type(screen.getByRole("textbox", { name: /Motivo da mudança/ }), "Primeira");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(props.create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("O prompt não pode ficar vazio.");
  });

  it("sem o papel de operador de IA, nada de nova versão", () => {
    setup({ canWrite: false });
    expect(screen.queryByRole("heading", { name: "Nova versão" })).toBeNull();
    expect(within(row(3)).queryByRole("button", { name: /publicação/ })).toBeNull();
  });
});
