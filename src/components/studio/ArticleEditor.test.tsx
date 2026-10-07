import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDraft } from "@/lib/studio/draft-store";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// O texto rico (Tiptap) vira um campo simples: o teste cobre o formulário, não o ProseMirror.
type Doc = { type: "doc"; content?: { content?: { text?: string }[] }[] };
const docText = (d: Doc) => d.content?.[0]?.content?.[0]?.text ?? "";
const textDoc = (text: string): Doc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] } as never],
});
vi.mock("./editor/LazyRichEditor", () => ({
  RichEditor: ({
    label,
    value,
    readOnly,
    onChange,
  }: {
    label: string;
    value: Doc;
    readOnly?: boolean;
    onChange?: (d: Doc) => void;
  }) => (
    <textarea
      aria-label={label}
      readOnly={readOnly}
      value={docText(value)}
      onChange={(e) => onChange?.(textDoc(e.target.value))}
    />
  ),
}));

import { ArticleEditor, type ArticleEditorHandle, type SaveReply } from "./ArticleEditor";

const base = {
  articleId: "a1",
  baseVersion: 3,
  userId: "u1",
  initial: {
    title: "Título salvo",
    dek: "Linha salva",
    body: textDoc("texto salvo"),
    sectionSlug: "cidade",
    topicId: null,
    tags: [],
    neighborhoods: [],
    seoTitle: "",
    seoDescription: "",
  },
  origins: {},
  options: {
    sections: [
      { value: "cidade", label: "Cidade" },
      { value: "politica", label: "Política" },
    ],
    topics: [],
  },
  seoLimits: { title: 60, description: 160 },
};

const conflict: SaveReply = {
  ok: false,
  message: "Outra pessoa salvou esta matéria.",
  conflict: {
    version: 4,
    diff: { title: [], dek: [], body: [{ op: "add", text: "outro" }] },
  },
};

beforeEach(() => refresh.mockClear());
afterEach(() => localStorage.clear());

describe("ArticleEditor · modo leitura (item 6, E-17)", () => {
  it("modo leitura desabilita todos os campos", () => {
    render(<ArticleEditor {...base} readOnly />);
    const combos = screen.getAllByRole("combobox");
    expect(combos.length).toBeGreaterThan(0);
    for (const el of combos) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole("textbox")) expect(el).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Salvar rascunho" })).not.toBeInTheDocument();
  });

  it("sem como salvar, também é só leitura", () => {
    render(<ArticleEditor {...base} />);
    for (const el of screen.getAllByRole("combobox")) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole("textbox")) expect(el).toHaveAttribute("readonly");
  });
});

describe("ArticleEditor · edição pendente (item 4)", () => {
  it("avisa quando há alteração não salva e quando volta ao salvo", async () => {
    const onDirtyChange = vi.fn();
    render(<ArticleEditor {...base} save={vi.fn()} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const title = screen.getByRole("textbox", { name: "Título" });
    await userEvent.type(title, "!");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.type(title, "{backspace}");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("expõe salvar para o diálogo de publicação", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Rascunho salvo · versão 4", version: 4 });
    const ref = createRef<ArticleEditorHandle>();
    render(<ArticleEditor {...base} save={save} handleRef={ref} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), " novo");
    let reply: SaveReply | null = null;
    await act(async () => {
      reply = await ref.current!.save();
    });
    expect(reply).toMatchObject({ ok: true, version: 4 });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a1",
        baseVersion: 3,
        doc: expect.objectContaining({ title: "Título salvo novo" }),
      }),
    );
  });
});

describe("ArticleEditor · conflito (item 5, E-04)", () => {
  it("conflito: recarregar guarda o texto local e oferece restaurar", async () => {
    const save = vi.fn().mockResolvedValue(conflict);
    const { rerender } = render(<ArticleEditor {...base} save={save} />);
    const body = screen.getByRole("textbox", { name: "Texto" });
    await userEvent.clear(body);
    await userEvent.type(body, "texto local");
    await userEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await userEvent.click(await screen.findByRole("button", { name: "Recarregar a versão atual" }));
    expect(refresh).toHaveBeenCalled();
    const kept = loadDraft("a1");
    expect(kept?.body).toEqual(textDoc("texto local"));
    expect(kept?.baseVersion).toBe(3);
    expect(screen.getByText("Guardamos o seu texto neste aparelho.")).toBeInTheDocument();

    // A versão nova chega do servidor: o formulário mostra o salvo, o aviso continua.
    rerender(
      <ArticleEditor
        {...base}
        baseVersion={4}
        initial={{ ...base.initial, body: textDoc("texto da outra pessoa") }}
        save={save}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Texto" })).toHaveValue("texto da outra pessoa");
    await userEvent.click(screen.getByRole("button", { name: "Restaurar meu texto" }));
    expect(screen.getByRole("textbox", { name: "Texto" })).toHaveValue("texto local");
    expect(loadDraft("a1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restaurar meu texto" })).not.toBeInTheDocument();
  });

  it("rascunho guardado de antes aparece ao abrir o editor", () => {
    localStorage.setItem(
      "cn:draft:a1",
      JSON.stringify({
        ...base.initial,
        body: textDoc("guardado antes"),
        baseVersion: 2,
        savedAt: "2026-10-04T12:00:00.000Z",
      }),
    );
    render(<ArticleEditor {...base} save={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Restaurar meu texto" })).toBeInTheDocument();
  });

  it("sem armazenamento local, o texto fica na memória da página", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const save = vi.fn().mockResolvedValue(conflict);
    const { rerender } = render(<ArticleEditor {...base} save={save} />);
    const body = screen.getByRole("textbox", { name: "Texto" });
    await userEvent.clear(body);
    await userEvent.type(body, "texto local");
    await userEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await userEvent.click(await screen.findByRole("button", { name: "Recarregar a versão atual" }));
    rerender(
      <ArticleEditor
        {...base}
        baseVersion={4}
        initial={{ ...base.initial, body: textDoc("texto da outra pessoa") }}
        save={save}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Restaurar meu texto" }));
    expect(screen.getByRole("textbox", { name: "Texto" })).toHaveValue("texto local");
    setItem.mockRestore();
  });
});

describe("ArticleEditor · barra de salvar e rascunho automático (item 48, E-18)", () => {
  afterEach(() => vi.useRealTimers());

  it("editar o título mostra Alterações não salvas e o contador do título", async () => {
    render(<ArticleEditor {...base} save={vi.fn()} savedAt="2026-10-04T18:02:00.000Z" />);
    // "Título salvo" tem 12 caracteres; o limite do título é 110.
    expect(screen.getByText("12/110")).toBeInTheDocument();
    expect(screen.getByText("Salvo às 14h02")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "!");
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    expect(screen.getByText("13/110")).toBeInTheDocument();
    expect(screen.queryByText("Salvo às 14h02")).not.toBeInTheDocument();
  });

  it("título acima do limite fica marcado com erro", () => {
    render(<ArticleEditor {...base} save={vi.fn()} />);
    const title = screen.getByRole("textbox", { name: "Título" });
    fireEvent.change(title, { target: { value: "x".repeat(111) } });
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("111/110")).toBeInTheDocument();
  });

  it("depois de salvar, a barra mostra a hora do salvamento", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-10-04T18:05:00.000Z") });
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Rascunho salvo · versão 4", version: 4 });
    render(<ArticleEditor {...base} save={save} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Novo título" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    });
    expect(await screen.findByText("Salvo às 14h05")).toBeInTheDocument();
  });

  it("guarda o rascunho neste aparelho 5 s depois da última edição", () => {
    vi.useFakeTimers({ now: new Date("2026-10-04T18:10:00.000Z") });
    render(<ArticleEditor {...base} save={vi.fn()} />);
    const title = screen.getByRole("textbox", { name: "Título" });
    fireEvent.change(title, { target: { value: "Título a" } });
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.change(title, { target: { value: "Título ab" } });
    act(() => vi.advanceTimersByTime(3000));
    // Debounce: a segunda edição reinicia a contagem.
    expect(loadDraft("a1")).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(loadDraft("a1")?.title).toBe("Título ab");
    expect(loadDraft("a1")?.baseVersion).toBe(3);
    // O rascunho automático desta sessão não vira aviso de "restaurar".
    expect(screen.queryByRole("button", { name: "Restaurar meu texto" })).not.toBeInTheDocument();
    expect(screen.getByText(/Guardado neste aparelho às 14h10/)).toBeInTheDocument();
  });

  it("salvar no servidor apaga o rascunho automático", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Rascunho salvo · versão 4", version: 4 });
    render(<ArticleEditor {...base} save={save} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Outro" },
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(loadDraft("a1")).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    });
    expect(loadDraft("a1")).toBeNull();
  });

  it("modo leitura não guarda rascunho nem mostra a barra de salvar", () => {
    vi.useFakeTimers();
    render(<ArticleEditor {...base} readOnly />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(loadDraft("a1")).toBeNull();
    expect(screen.queryByText("Alterações não salvas")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/110$/)).not.toBeInTheDocument();
  });

  it("com alteração pendente, sair por link pede confirmação", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <>
        <Link href="/estudio/fila">Fila</Link>
        <ArticleEditor {...base} save={vi.fn()} />
      </>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "!");
    fireEvent.click(screen.getByRole("link", { name: "Fila" }));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("ArticleEditor · atalho de salvar (UX-W3-T5, item 53)", () => {
  const ctrlS = (target: EventTarget, init: KeyboardEventInit = { ctrlKey: true }) => {
    const ev = new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(ev);
    return ev;
  };

  it("Ctrl+S salva mesmo com o foco no campo e impede o salvar do navegador", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, message: "Salvo", version: 4 });
    render(<ArticleEditor {...base} save={save} />);
    const title = screen.getByRole("textbox", { name: "Título" });
    title.focus();
    let ev: KeyboardEvent | undefined;
    await act(async () => {
      ev = ctrlS(title);
    });
    expect(ev?.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("modo leitura: ⌘+S não salva", async () => {
    const save = vi.fn();
    render(<ArticleEditor {...base} save={save} readOnly />);
    await act(async () => {
      ctrlS(document.body, { metaKey: true });
    });
    expect(save).not.toHaveBeenCalled();
  });
});
