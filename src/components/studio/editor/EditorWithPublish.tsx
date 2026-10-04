"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArticleEditor, type ArticleEditorHandle, type ArticleEditorProps } from "../ArticleEditor";
import { PublishDialog, type PublishDialogProps, type PublishReply } from "../PublishDialog";

type PublishInput = Parameters<PublishDialogProps["publish"]>[0];

export interface EditorWithPublishProps {
  editor: Omit<ArticleEditorProps, "onDirtyChange" | "handleRef">;
  /**
   * Diálogo de publicação, quando a pessoa pode publicar. `action` recebe a versão base: depois
   * de "Salvar e publicar" ela é a versão recém-salva, nunca a que a página abriu.
   */
  publish?: Omit<PublishDialogProps, "publish" | "dirty" | "onSaveFirst"> & {
    action: (baseVersion: number, input: PublishInput) => Promise<PublishReply>;
  };
  /** Rótulo da coluna lateral. */
  asideLabel: string;
  /** Resto da coluna lateral (checklist, imagem, sugestões, fontes), abaixo do diálogo. */
  children?: ReactNode;
}

/**
 * Liga o editor ao diálogo de publicação (item 4, E-02): com alteração não salva, publicar vira
 * "Salvar e publicar"; se salvar falhar (conflito, erro), nada é publicado.
 */
export function EditorWithPublish({
  editor,
  publish,
  asideLabel,
  children,
}: EditorWithPublishProps) {
  const handle = useRef<ArticleEditorHandle>(null);
  const [dirty, setDirty] = useState(false);
  // Último salvamento feito aqui; a publicação confirma a maior entre ela e a da página.
  const saved = useRef(0);
  const base = editor.baseVersion;

  const saveFirst = useCallback(async () => {
    const r = await handle.current?.save();
    if (!r?.ok) return false;
    saved.current = r.version;
    return true;
  }, []);

  const action = publish?.action;
  const doPublish = useCallback(
    (input: PublishInput) =>
      action
        ? action(Math.max(base, saved.current), input)
        : Promise.resolve<PublishReply>({ ok: false, message: "" }),
    [action, base],
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <ArticleEditor {...editor} onDirtyChange={setDirty} handleRef={handle} />
      <aside className="flex flex-col gap-4" aria-label={asideLabel}>
        {publish && (
          <PublishDialog
            articleId={publish.articleId}
            blocker={publish.blocker}
            labels={publish.labels}
            hasTopic={publish.hasTopic}
            headline={publish.headline}
            canRequestUrgent={publish.canRequestUrgent}
            className={publish.className}
            publish={doPublish}
            dirty={dirty}
            onSaveFirst={saveFirst}
          />
        )}
        {children}
      </aside>
    </div>
  );
}
