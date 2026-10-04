"use client";

import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/react";
import { useId } from "react";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../../cx";
import { AiSuggestion, HumanEdit, humanTyping } from "./marks";

export interface RichEditorProps {
  /** Documento Tiptap em JSON (doc → paragraph/heading → text com marcas). */
  value: JSONContent;
  onChange?: (doc: JSONContent) => void;
  label: string;
  /** Pessoa da sessão: vai na marca `humanEdit` do que ela digitar. */
  userId: string;
  readOnly?: boolean;
  className?: string;
}

/**
 * Editor rico do Estúdio (Tiptap): parágrafos, intertítulos, negrito e itálico, com as marcas de
 * origem `aiSuggestion` e `humanEdit`. Barra de formatação com botões nomeados e estado
 * (`aria-pressed`); legenda textual das marcas (nada depende só de cor).
 */
export function RichEditor({
  value,
  onChange,
  label,
  userId,
  readOnly = false,
  className,
}: RichEditorProps) {
  const labelId = useId();
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
        link: false,
        underline: false,
      }),
      AiSuggestion,
      HumanEdit,
      Extension.create({
        name: "cnHumanTyping",
        addProseMirrorPlugins: () => [humanTyping(userId)],
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        class: cx(
          "cn-prose min-h-64 rounded-b-lg border border-t-0 border-line-control bg-input px-4 py-3",
          "reading-body text-strong",
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
  });

  const tool = (
    name: string,
    active: boolean,
    run: () => void,
    content: string,
    extra?: string,
  ) => (
    <button
      type="button"
      aria-pressed={active}
      aria-label={name}
      disabled={!editor || readOnly}
      onClick={run}
      className={cx(
        "flex min-h-tap min-w-11 items-center justify-center rounded-sm px-2 text-14 text-strong",
        "hover:bg-hover aria-pressed:bg-hover disabled:text-placeholder",
        extra,
      )}
    >
      {content}
    </button>
  );

  return (
    <div className={cx("flex flex-col", className)}>
      <span id={labelId} className="mb-2 type-label text-16 text-strong">
        {label}
      </span>
      <div
        role="toolbar"
        aria-label={T.bodyToolbar}
        className="flex flex-wrap gap-1 rounded-t-lg border border-line-control bg-section p-1"
      >
        {tool(
          T.paragraph,
          editor?.isActive("paragraph") ?? false,
          () => editor?.chain().focus().setParagraph().run(),
          "¶",
        )}
        {tool(
          T.heading,
          editor?.isActive("heading", { level: 2 }) ?? false,
          () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          "H2",
          "font-bold",
        )}
        {tool(
          T.bold,
          editor?.isActive("bold") ?? false,
          () => editor?.chain().focus().toggleBold().run(),
          "N",
          "font-bold",
        )}
        {tool(
          T.italic,
          editor?.isActive("italic") ?? false,
          () => editor?.chain().focus().toggleItalic().run(),
          "I",
          "italic",
        )}
      </div>
      <EditorContent editor={editor} />
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta">
        <span>
          <span className="cn-mark-ai">{T.aiMarkLegend}</span>
        </span>
        <span>
          <span className="cn-mark-human">{T.humanMarkLegend}</span>
        </span>
      </p>
    </div>
  );
}
