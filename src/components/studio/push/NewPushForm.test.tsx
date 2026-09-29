import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleOption } from "@/lib/db/queries/push-admin";
import { NewPushForm } from "./NewPushForm";

const ART: ArticleOption = {
  id: "c2000000-0000-4000-8000-000000000007",
  slug: "qualidade-do-ar",
  title: "Qualidade do ar em Cuiabá fica ruim pelo terceiro dia seguido com a fumaça das queimadas",
  dek: "Defesa Civil alerta para umidade abaixo de 20% e recomenda hidratação e pausas ao ar livre.",
  sectionSlug: "clima",
  sectionName: "Clima",
  publishedAt: "2026-09-28T12:00:00Z",
  originLabel: "ORIGINAL CITYNEWS",
  urgent: false,
};

const request = vi.fn();
const estimate = vi.fn();
const search = vi.fn();
const sections = [
  { slug: "cidade", name: "Cidade" },
  { slug: "clima", name: "Clima" },
];
// Relógio fixo: 2026-09-29 15:00 UTC (11h de Cuiabá).
const now = () => new Date("2026-09-29T15:00:00Z");

beforeEach(() => {
  request.mockReset();
  estimate.mockReset().mockResolvedValue({ ok: true, message: "cerca de 40", data: { reach: 40 } });
  search.mockReset().mockResolvedValue({ ok: true, message: "", data: { items: [ART] } });
});

const setup = (kinds: ("urgent" | "highlight")[] = ["urgent", "highlight"]) =>
  render(
    <NewPushForm
      kinds={kinds}
      sections={sections}
      templates={[{ name: "Padrão", title: "{titulo}", body: "{linha_fina}" }]}
      paused={false}
      request={request}
      estimate={estimate}
      search={search}
      now={now}
    />,
  );

async function pickArticle() {
  const input = screen.getByRole("combobox", { name: "Matéria" });
  await userEvent.type(input, "Qualidade");
  const option = await screen.findByRole("option", { name: /Qualidade do ar/ });
  await userEvent.click(option);
  expect(screen.getByRole("group", { name: "Matéria escolhida" })).toBeVisible();
}

describe("NewPushForm (spec §10.2)", () => {
  it("urgente não oferece Agendar; Destaque às 23h mostra o erro de silêncio", async () => {
    setup();
    expect(screen.getByRole("radio", { name: /^Urgente/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Agendar" })).toBeNull();
    expect(screen.getByText("Urgente só sai agora.")).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: /^Destaque da redação/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    const at = screen.getByLabelText("Data e hora (fuso de Cuiabá)");
    await userEvent.type(at, "2026-09-30T23:00");
    expect(
      await screen.findByText("Fora do silêncio: escolha um horário entre 7h e 22h."),
    ).toBeVisible();
    await userEvent.clear(at);
    await userEvent.type(at, "2026-10-20T10:00");
    expect(await screen.findByText("Agende no máximo 7 dias à frente.")).toBeVisible();
  });

  it("contadores 60/120 e bloqueio acima do limite", async () => {
    setup(["highlight"]);
    await pickArticle();
    const title = screen.getByLabelText("Título") as HTMLInputElement;
    const body = screen.getByLabelText("Texto") as HTMLTextAreaElement;
    // Título da matéria cortado em 60 com reticências; linha fina em 120.
    expect(title.value.length).toBeLessThanOrEqual(60);
    expect(title.value.endsWith("…")).toBe(true);
    expect(screen.getByText(`${title.value.length} de 60`)).toBeVisible();
    expect(screen.getByText(`${body.value.length} de 120`)).toBeVisible();
    expect(title).toHaveAttribute("maxlength", "60");
    expect(body).toHaveAttribute("maxlength", "120");
    // Prévia com o rótulo de origem na frente do texto.
    expect(
      screen.getAllByText(new RegExp(`ORIGINAL CITYNEWS · ${body.value.slice(0, 20)}`)),
    ).toHaveLength(3);
    // Alcance estimado com o público "todos".
    await waitFor(() => expect(screen.getByText("cerca de 40 inscrições")).toBeVisible());
    expect(estimate).toHaveBeenCalled();
    // Vazio bloqueia com erro por campo.
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: "Enviar para aprovação" }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível criar o pedido.");
    expect(title).toHaveAccessibleDescription("Preencha este campo.");
  });

  it("urgente exige justificativa; pedido enviado mostra o status e o link para a fila", async () => {
    request.mockResolvedValue({
      ok: true,
      message: "Pedido criado. Aguardando aprovação de outra pessoa.",
      data: { id: "x" },
    });
    setup();
    await pickArticle();
    await userEvent.click(screen.getByRole("button", { name: "Enviar para aprovação" }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Justificativa")).toHaveAccessibleDescription(
      /Justificativa obrigatória para urgente/,
    );
    await userEvent.type(screen.getByLabelText("Justificativa"), "Alerta da Defesa Civil");
    await userEvent.click(screen.getByRole("button", { name: "Enviar para aprovação" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const form = request.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(form.entries())).toMatchObject({
      kind: "urgent",
      articleId: ART.id,
      audienceType: "all",
      whenType: "now",
      justification: "Alerta da Defesa Civil",
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Pedido criado. Aguardando aprovação de outra pessoa.");
    expect(within(status).getByRole("link", { name: "Ver a fila" })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes/fila",
    );
    // Formulário limpo para o próximo pedido.
    expect(screen.getByRole("combobox", { name: "Matéria" })).toBeVisible();
  });

  it("segmento por editoria envia o alvo e mostra 'menos de 20'", async () => {
    estimate.mockResolvedValue({ ok: true, message: "menos de 20", data: { reach: 0 } });
    setup(["highlight"]);
    await userEvent.click(screen.getByRole("radio", { name: "Segmento" }));
    await userEvent.selectOptions(screen.getByLabelText("Editoria"), "clima");
    await waitFor(() => expect(screen.getByText("menos de 20 inscrições")).toBeVisible());
    const last = estimate.mock.calls.at(-1)![0] as FormData;
    expect(Object.fromEntries(last.entries())).toMatchObject({
      kind: "highlight",
      audienceType: "section",
      audienceSlug: "clima",
    });
  });
});
