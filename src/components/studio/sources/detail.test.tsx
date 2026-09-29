import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceConfig } from "@/lib/sources/types";
import { ConfirmByTypingDialog } from "./ConfirmByTypingDialog";
import { SourceAuditTable } from "./SourceAuditTable";
import { SourceConfigForm } from "./SourceConfigForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const config: SourceConfig = {
  name: "Portal Várzea",
  displayName: null,
  ownerId: null,
  layer: 2,
  categories: ["cidade"],
  locality: "varzea-grande",
  reliability: "standard",
  imagePolicy: "none",
  republishPolicy: "link_only",
  maySoleSource: false,
  agreementUntil: null,
  agreementNote: null,
  termsUrl: null,
  termsMinIntervalMinutes: null,
  frequencyMinutes: null,
  rateLimitPerHour: 60,
  editorialScore: 3,
  priority: 2,
};
const form = (status: "active" | "paused") => (
  <SourceConfigForm
    id="i"
    version={1}
    config={config}
    slug="portal-varzea"
    status={status}
    archived={false}
    sections={[{ slug: "cidade", label: "Cidade" }]}
    fastLane={{ used: 0, max: 10 }}
    frequency={{ chosen: null, effective: 30, raisedBy: null, lane: "normal", defaultMinutes: 30 }}
    nextCollectionAt={null}
    termsReviewedAt={null}
    address={{ baseUrl: "https://x.example/", feedUrl: null, kind: "rss" }}
    pageSelectors={null}
    action={async () => ({ ok: true, message: "ok" })}
  />
);

describe("ConfirmByTypingDialog", () => {
  it("só habilita com o nome idêntico e o motivo", async () => {
    render(
      <ConfirmByTypingDialog
        open
        onClose={() => {}}
        title="Excluir"
        intro="x"
        confirmText="Portal Várzea"
        confirmLabel="Digite Portal Várzea para confirmar"
        reasonLabel="Motivo"
        submitLabel="Excluir fonte"
        action={async () => ({ ok: true, message: "ok" })}
        hidden={{ id: "i" }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Excluir fonte" });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo"), "duplicada");
    await userEvent.type(
      screen.getByLabelText("Digite Portal Várzea para confirmar"),
      "Portal Varzea",
    );
    expect(btn).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Digite Portal Várzea para confirmar"));
    await userEvent.type(
      screen.getByLabelText("Digite Portal Várzea para confirmar"),
      "Portal Várzea",
    );
    expect(btn).toBeEnabled();
  });
});

describe("SourceConfigForm", () => {
  it("campo crítico leva selo e a justificativa aparece só quando ele muda", async () => {
    render(form("active"));
    expect(screen.getAllByText("Exige segunda aprovação").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByLabelText("Justificativa da alteração")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Política de imagem"), "reproduction");
    expect(screen.getByLabelText("Justificativa da alteração")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Política de imagem"), "none");
    expect(screen.queryByLabelText("Justificativa da alteração")).not.toBeInTheDocument();
  });
  it("não oferece 25 nem 45 min e desabilita a via rápida com o motivo em fonte pausada", () => {
    render(form("paused"));
    const sel = screen.getByLabelText("Frequência de coleta");
    expect(sel.querySelector('option[value="25"]')).toBeNull();
    expect(sel.querySelector('option[value="45"]')).toBeNull();
    expect(sel.querySelector('option[value="10"]')).toBeDisabled();
    expect(screen.getByText("Ative a fonte antes de colocá-la na via rápida.")).toBeInTheDocument();
  });
  it("fonte ativa com vaga habilita a via rápida", () => {
    render(form("active"));
    expect(
      screen.getByLabelText("Frequência de coleta").querySelector('option[value="10"]'),
    ).toBeEnabled();
  });
});

describe("SourceAuditTable", () => {
  it("cabeçalhos com scope=col e mudança antes → depois", () => {
    render(
      <SourceAuditTable
        page={1}
        total={1}
        pageSize={20}
        basePath="/x"
        rows={[
          {
            id: 1,
            at: "2026-09-27T18:00:00Z",
            actor: "u",
            actorName: "Helena Costa",
            action: "source.update",
            changes: [{ field: "image_policy", from: "none", to: "reproduction" }],
            reason: "acordo",
            batchId: null,
            approvalId: "a",
          },
        ]}
      />,
    );
    for (const th of screen.getAllByRole("columnheader"))
      expect(th).toHaveAttribute("scope", "col");
    expect(screen.getByText("Helena Costa")).toBeInTheDocument();
    expect(screen.getByText(/Sem imagens/)).toBeInTheDocument();
    expect(screen.getByText("Com segunda aprovação")).toBeInTheDocument();
  });
});
