import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./LazyRichEditor", () => ({
  RichEditor: ({ label }: { label: string }) => <div role="textbox" aria-label={label} />,
}));

import { EditorWithPublish } from "./EditorWithPublish";

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const editor = {
  articleId: "a1",
  baseVersion: 3,
  userId: "u1",
  initial: {
    title: "Título salvo",
    dek: "",
    body: { type: "doc", content: [] },
    sectionSlug: "cidade",
    topicId: null,
    tags: [],
    neighborhoods: [],
    seoTitle: "",
    seoDescription: "",
  },
  origins: {},
  options: { sections: [{ value: "cidade", label: "Cidade" }], topics: [] },
  seoLimits: { title: 60, description: 160 },
};

const publishBase = { articleId: "a1", labels: [], hasTopic: false };

describe("EditorWithPublish (item 4, E-02)", () => {
  it("sem edição, publica a versão da página", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Matéria publicada" });
    const save = vi.fn();
    render(
      <EditorWithPublish
        editor={{ ...editor, save }}
        publish={{ ...publishBase, action }}
        asideLabel="Editor de matéria"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    expect(save).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith(3, expect.objectContaining({ id: "a1", when: "now" }));
  });

  it("com edição, salva e publica a versão recém-salva", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Matéria publicada" });
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Rascunho salvo · versão 4", version: 4 });
    render(
      <EditorWithPublish
        editor={{ ...editor, save }}
        publish={{ ...publishBase, action }}
        asideLabel="Editor de matéria"
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), " novo");
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar e publicar" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 3,
        doc: expect.objectContaining({ title: "Título salvo novo" }),
      }),
    );
    expect(action).toHaveBeenCalledWith(4, expect.objectContaining({ id: "a1" }));
  });

  it("conflito ao salvar: nada é publicado", async () => {
    const action = vi.fn();
    const save = vi.fn().mockResolvedValue({
      ok: false,
      message: "Outra pessoa salvou esta matéria.",
      conflict: { version: 4, diff: { title: [], dek: [], body: [] } },
    });
    render(
      <EditorWithPublish
        editor={{ ...editor, save }}
        publish={{ ...publishBase, action }}
        asideLabel="Editor de matéria"
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), " novo");
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar e publicar" }));
    expect(save).toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});
