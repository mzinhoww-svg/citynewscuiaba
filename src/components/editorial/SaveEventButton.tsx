"use client";

import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { Button } from "../ui/Button";

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
  const saved = profile?.saved.some((s) => s.ref === contentRef) ?? false;
  const toggle = () => {
    if (saved) void act((s) => s.unsave(contentRef));
    else void act((s) => s.save(contentRef, 0, { title, href, section: "agenda" }));
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
