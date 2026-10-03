import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { REPORT_IDLE } from "@/lib/reports/form-state";
import { ArticleActions } from "./ArticleActions";

vi.mock("@/lib/anon/use-profile", async () => {
  const { useState } = await import("react");
  return {
    useAnonProfile: () => {
      const [saved, setSaved] = useState<Array<{ ref: string }>>([]);
      return {
        profile: { saved },
        ready: true,
        act: async () => setSaved([{ ref: "article:a1" }]),
      };
    },
  };
});
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => vi.fn() }));
vi.mock("@/lib/anon/invite", () => ({ requestLoginInvite: vi.fn() }));
vi.mock("@/lib/anon/store", () => ({
  getAnonStore: () => ({ get: vi.fn(async () => ({ saved: [] })) }),
}));
vi.mock("@/lib/offline/sw", () => ({ cacheSaved: vi.fn() }));

const article = { id: "a1", title: "Título", href: "/materia/x", section: "Cidade" };
const action = async () => REPORT_IDLE;

describe("ArticleActions", () => {
  it("três botões sm de mesma altura no grupo e o link Informar problema fora dele", () => {
    render(<ArticleActions article={article} reportAction={action} />);
    const group = screen.getByRole("group", { name: "Ações da matéria" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Salvar",
      "Compartilhar",
      "Ajustar leitura",
    ]);
    for (const b of buttons) expect(b.className).toContain("h-button-sm");
    expect(within(group).queryByText("Informar problema")).toBeNull();
    const link = screen.getByRole("button", { name: "Informar problema" });
    expect(group.contains(link)).toBe(false);
    expect(link.className).not.toMatch(/(^|\s)h-button-sm(\s|$)/);
  });

  it("a mensagem de salvo é role=status fora do grupo de botões", async () => {
    render(<ArticleActions article={article} reportAction={action} />);
    const group = screen.getByRole("group", { name: "Ações da matéria" });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Salvar" }));
    const status = await screen.findByRole("status");
    expect(group.contains(status)).toBe(false);
  });

  it("sem curtir", () => {
    const { container } = render(<ArticleActions article={article} reportAction={action} />);
    expect(container.textContent).not.toMatch(/curt|coment/i);
  });
});
