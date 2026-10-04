import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionFn } from "@/lib/sources/action-state";
import { SourceLogoForm } from "./SourceLogoForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const source = {
  id: "0b7e3c1e-5a52-4a4c-9c3e-3f6f1f5b8a10",
  version: 3,
  name: "MT Agora",
  logoUrl: null,
  archived: false,
};
const upload = vi.fn<ActionFn>(async () => ({ ok: true, message: "Logotipo salvo" }));

beforeEach(() => refresh.mockClear());

describe("SourceLogoForm: Buscar logo (R27)", () => {
  it("chama a ação só com o id da fonte e mostra o resultado", async () => {
    const discover = vi.fn<ActionFn>(async () => ({
      ok: true,
      message: "Logotipo encontrado em mtagora.example e salvo.",
    }));
    render(<SourceLogoForm source={source} action={upload} discoverAction={discover} />);
    await userEvent.click(screen.getByRole("button", { name: "Buscar logo" }));
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(1));
    const form = discover.mock.calls[0]![0] as FormData;
    expect(form.get("id")).toBe(source.id);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Logotipo encontrado em mtagora.example",
    );
    expect(refresh).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("falha aparece como alerta e não atualiza a tela", async () => {
    const discover = vi.fn<ActionFn>(async () => ({
      ok: false,
      message: "Nenhum logotipo utilizável foi encontrado no site. Envie um arquivo.",
    }));
    render(<SourceLogoForm source={source} action={upload} discoverAction={discover} />);
    await userEvent.click(screen.getByRole("button", { name: "Buscar logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nenhum logotipo utilizável");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sem a ação, ou com a fonte arquivada, não há botão", () => {
    const { rerender } = render(<SourceLogoForm source={source} action={upload} />);
    expect(screen.queryByRole("button", { name: "Buscar logo" })).toBeNull();
    rerender(
      <SourceLogoForm
        source={{ ...source, archived: true }}
        action={upload}
        discoverAction={vi.fn<ActionFn>()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Buscar logo" })).toBeNull();
  });

  it("Remover logotipo: só aparece com logotipo e envia id e versão", async () => {
    const remove = vi.fn<ActionFn>(async () => ({ ok: true, message: "Logotipo removido." }));
    const { rerender } = render(
      <SourceLogoForm source={source} action={upload} removeAction={remove} />,
    );
    expect(screen.queryByRole("button", { name: "Remover logotipo" })).toBeNull();
    rerender(
      <SourceLogoForm
        source={{
          ...source,
          logoUrl: "https://x.supabase.co/storage/v1/object/public/source-logos/a/b.png",
        }}
        action={upload}
        removeAction={remove}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    const form = remove.mock.calls[0]![0] as FormData;
    expect(form.get("id")).toBe(source.id);
    expect(form.get("version")).toBe("3");
    expect(await screen.findByRole("status")).toHaveTextContent("Logotipo removido.");
    expect(refresh).toHaveBeenCalled();
  });
});
