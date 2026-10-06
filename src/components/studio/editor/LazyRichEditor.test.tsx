import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { RichEditor, RichEditorSkeleton } from "./LazyRichEditor";

describe("editor rico sob demanda (item 85)", () => {
  it("o esqueleto mostra o rótulo e avisa o carregamento, sem controles", () => {
    render(<RichEditorSkeleton label={T.fields.body} />);
    expect(screen.getByText(T.fields.body)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(T.bodyLoading);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("o editor começa pelo esqueleto e depois carrega o Tiptap", async () => {
    render(
      <RichEditor
        label={T.fields.body}
        value={{ type: "doc", content: [{ type: "paragraph" }] }}
        userId="u1"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(T.bodyLoading);
    expect(await screen.findByRole("toolbar", { name: T.bodyToolbar })).toBeInTheDocument();
    expect(screen.queryByText(T.bodyLoading)).toBeNull();
  });
});
