"use client";

import dynamic from "next/dynamic";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../../cx";
import type { RichEditorProps } from "./Editor";

/**
 * Esqueleto do editor rico enquanto o Tiptap baixa: mesmo rótulo, barra e caixa (sem salto de
 * layout), sem controles ativos. O Tiptap (com o ProseMirror) só vem quando o editor monta.
 */
export function RichEditorSkeleton({
  label,
  className,
}: Pick<RichEditorProps, "label" | "className">) {
  return (
    <div className={cx("flex flex-col", className)} aria-busy="true">
      <span className="mb-2 type-label text-strong">{label}</span>
      <div
        aria-hidden="true"
        className="flex min-h-tap flex-wrap gap-1 rounded-t-lg border border-line-control bg-section p-1"
      />
      <div
        role="status"
        className="min-h-64 rounded-b-lg border border-t-0 border-line-control bg-input px-4 py-3 type-meta text-meta"
      >
        {T.bodyLoading}
      </div>
    </div>
  );
}

/**
 * Editor rico do Estúdio sob demanda (item 85, A-156): `next/dynamic` sem SSR. O `useEditor`
 * já não renderizava no servidor (`immediatelyRender: false`); agora o código do Tiptap também
 * sai do JavaScript inicial das telas do Estúdio que mostram o editor.
 */
export const RichEditor = dynamic<RichEditorProps>(
  () => import("./Editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => <RichEditorSkeleton label={T.fields.body} />,
  },
);
