import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArticleActions } from "./ArticleActions";

vi.mock("@/lib/anon/use-profile", async () => {
  const { useState } = await import("react");
  return {
    useAnonProfile: () => {
      const [saved, setSaved] = useState<Array<{ ref: string }>>([]);
      return {
        profile: { saved },
        ready: true,
        act: async () => {
          setSaved([{ ref: "article:a1" }]);
          return { ok: true, value: undefined };
        },
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

describe("ArticleActions", () => {
  it("três botões md (44 px) com folga gap-3, sem Informar problema (fica no De onde veio)", () => {
    render(<ArticleActions article={article} />);
    const group = screen.getByRole("group", { name: "Ações da matéria" });
    expect(group.className).toMatch(/(^|\s)gap-3(\s|$)/);
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Salvar",
      "Compartilhar",
      "Ajustar leitura",
    ]);
    for (const b of buttons) {
      expect(b.className).toContain("h-tap");
      expect(b.className).not.toMatch(/(^|\s)h-button-sm(\s|$)/);
    }
    expect(screen.queryByText("Informar problema")).toBeNull();
    expect(screen.queryByRole("button", { name: "Informar problema" })).toBeNull();
  });

  it("Ver favoritos tem alvo de toque de 44 px", async () => {
    render(<ArticleActions article={article} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const link = await screen.findByRole("link", { name: /ver favoritos/i });
    expect(link.className).toMatch(/min-h-tap/);
  });

  it("a mensagem de salvo é role=status fora do grupo de botões", async () => {
    render(<ArticleActions article={article} />);
    const group = screen.getByRole("group", { name: "Ações da matéria" });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Salvar" }));
    const status = await screen.findByRole("status");
    expect(group.contains(status)).toBe(false);
  });

  it("sem curtir", () => {
    const { container } = render(<ArticleActions article={article} />);
    expect(container.textContent).not.toMatch(/curt|coment/i);
  });
});
