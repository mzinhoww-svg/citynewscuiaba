"use client";

import { useState, useTransition } from "react";
import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Icon } from "../ui/Icon";

export type GenerateReply =
  | {
      ok: true;
      prompt: string;
      alt: string;
      restrictions: string[];
      generatorAvailable: boolean;
      message?: string;
    }
  | { ok: false; message: string };

export interface GenerateImageDrawerProps {
  articleId: string;
  suggest: (i: { articleId: string }) => Promise<GenerateReply>;
  className?: string;
}

/**
 * Geração de imagem (E12) em painel lateral: restrições fixas sempre visíveis (não fotorrealista,
 * sem pessoas reais, sem crime/tragédia/saúde individual, rótulo IMAGEM GERADA POR IA), descrição
 * sugerida a partir da matéria e recusa explicada quando o tema não permite.
 */
export function GenerateImageDrawer({ articleId, suggest, className }: GenerateImageDrawerProps) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<GenerateReply | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className={className}>
      <Button size="md" variant="outline" icon="camera" onClick={() => setOpen(true)}>
        {T.generate}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={T.generateTitle}
        side="right"
        closeLabel={T.close}
      >
        <div className="flex flex-col gap-5 p-6">
          <section className="flex flex-col gap-2">
            <h3 className="type-eyebrow text-meta">{T.restrictionsTitle}</h3>
            <ul className="flex flex-col gap-1">
              {T.restrictions.map((r) => (
                <li key={r} className="flex items-start gap-2 type-body text-strong">
                  <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-meta" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="type-meta text-meta">{T.label}</p>
          </section>
          <div>
            <Button
              size="md"
              disabled={pending}
              onClick={() => start(async () => setReply(await suggest({ articleId })))}
            >
              {T.suggest}
            </Button>
          </div>
          <div role="status" aria-live="polite" className="flex flex-col gap-3">
            {reply && !reply.ok && (
              <p className="flex items-start gap-2 type-body text-danger">
                <Icon name="circle-alert" size={20} className="mt-0.5 shrink-0" />
                {reply.message}
              </p>
            )}
            {reply?.ok && (
              <>
                <div className="rounded-md border border-dashed border-ai bg-ia-soft p-3">
                  <p className="type-eyebrow text-ai">{T.suggestedPrompt}</p>
                  <p className="mt-1 type-body text-strong">{reply.prompt}</p>
                  <p className="mt-2 type-eyebrow text-ai">{T.suggestedAlt}</p>
                  <p className="mt-1 type-body text-strong">{reply.alt}</p>
                </div>
                {!reply.generatorAvailable && (
                  <p className={cx("type-meta text-warn")}>{T.generatorUnavailable}</p>
                )}
              </>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
