"use client";

import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { ANON_TEXT } from "@/content/pt-BR/privacy-anon";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export interface SaveEventButtonProps {
  /** `event:<id>`. */
  contentRef: string;
  title: string;
  /** Caminho interno do evento (`/agenda/...`). */
  href: string;
  className?: string;
}

/**
 * Salvar evento (agenda) sem login: guarda no perfil local, no mesmo lugar das matérias
 * salvas, e aparece em Favoritos. Botão alternável (`aria-pressed`); o nome acessível leva o
 * título do evento.
 *
 * ```tsx
 * <SaveEventButton contentRef={`event:${e.id}`} title={e.title} href={e.href} />
 * ```
 */
export function SaveEventButton({ contentRef, title, href, className }: SaveEventButtonProps) {
  const { profile, ready, act } = useAnonProfile();
  const toast = useToast();
  const saved = profile?.saved.some((s) => s.ref === contentRef) ?? false;
  const toggle = () => {
    void act((s) =>
      saved ? s.unsave(contentRef) : s.save(contentRef, 0, { title, href, section: "agenda" }),
    ).then((r) => {
      if (!r.ok) toast.show({ message: ANON_TEXT.actFailed, tone: "error" });
    });
  };
  return (
    <span data-save-event="" data-ready={ready ? "true" : undefined} className="inline-flex">
      <Button
        variant={saved ? "outline-strong" : "outline"}
        size="md"
        icon="bookmark"
        pressed={saved}
        onClick={toggle}
        aria-label={AGENDA.saveLabel(title)}
        className={className}
      >
        {AGENDA.save}
      </Button>
    </span>
  );
}
