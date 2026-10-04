import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { Label } from "@/lib/labels";
import { MediaGrid, type MediaGridItem } from "./MediaGrid";

const label: Label = { kind: "image_reproduction", text: "Foto: reprodução web" };
const item = (id: string, credit: string): MediaGridItem => ({
  id,
  href: `/estudio/midia/${id}`,
  previewSrc: `/api/estudio/midia/${id}`,
  credit,
  label,
  status: "Pendente",
  risk: "Baixo",
  licenseNote: null,
  licenseWarn: false,
});

describe("MediaGrid · aprovação em lote (UX-W3-T1, item 46)", () => {
  it("sem approveMany não há seleção", () => {
    render(<MediaGrid items={[item("m1", "Folha do Cerrado")]} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("seleciona várias e aprova as selecionadas numa ação", async () => {
    const approveMany = vi.fn().mockResolvedValue({ ok: true, message: "2 imagens aprovadas" });
    render(
      <MediaGrid
        items={[item("m1", "Folha do Cerrado"), item("m2", "MT Agora"), item("m3", "Arquivo")]}
        approveMany={approveMany}
      />,
    );
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar imagem: Folha do Cerrado" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar imagem: Arquivo" }));
    await userEvent.click(screen.getByRole("button", { name: "Aprovar 2 selecionadas" }));
    expect(approveMany).toHaveBeenCalledWith({ ids: ["m1", "m3"] });
    expect(await screen.findByText("2 imagens aprovadas")).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it("'Selecionar todas' marca a página inteira", async () => {
    render(
      <MediaGrid
        items={[item("m1", "Folha do Cerrado"), item("m2", "MT Agora")]}
        approveMany={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar imagem: MT Agora" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Aprovar 2 selecionadas" })).toBeEnabled();
  });
});
