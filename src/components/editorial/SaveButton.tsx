"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SAVE_TEXT } from "@/content/pt-BR/favorites";
import { requestLoginInvite } from "@/lib/anon/invite";
import { getAnonStore } from "@/lib/anon/store";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { useTrack } from "@/lib/events/use-track";
import { cacheSaved } from "@/lib/offline/sw";
import { Button } from "../ui/Button";

export interface SaveButtonProps {
  /** `article:<id>`. */
  contentRef: string;
  title: string;
  href: string;
  section?: string;
  /** Elemento da matéria (progresso de leitura do salvo). */
  targetId: string;
}

function readPct(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  if (total <= 0) return rect.top < window.innerHeight ? 100 : 0;
  return Math.round(Math.min(1, Math.max(0, -rect.top / total)) * 100);
}

/**
 * Salvar matéria (P03, P17) sem login: guarda no perfil local com título e link, marca o
 * progresso de leitura ("lido 60%") e deixa as 20 últimas para ler offline. O convite de login
 * (P2-T10) é só avisado pelo ponto de extensão.
 */
export function SaveButton({ contentRef, title, href, section, targetId }: SaveButtonProps) {
  const { profile, ready, act } = useAnonProfile();
  const send = useTrack();
  const [justSaved, setJustSaved] = useState(false);
  const saved = profile?.saved.some((s) => s.ref === contentRef) ?? false;
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let max = 0;
    const onScroll = () => {
      max = Math.max(max, readPct(el));
    };
    const flush = () => {
      if (savedRef.current && max > 0) void act((s) => s.setProgress(contentRef, max));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [act, contentRef, targetId]);

  const toggle = () => {
    if (saved) {
      setJustSaved(false);
      void act((s) => s.unsave(contentRef));
      return;
    }
    void act((s) => s.save(contentRef, 0, { title, href, section })).then(async () => {
      setJustSaved(true);
      void send("article_saved", { surface: "materia" }, { contentId: contentRef });
      requestLoginInvite("save");
      const p = await getAnonStore().get();
      void cacheSaved(p.saved.flatMap((s) => (s.href ? [s.href] : [])));
    });
  };

  return (
    <span data-ready={ready ? "true" : undefined} className="contents">
      <Button
        variant={saved ? "outline-strong" : "primary"}
        size="md"
        icon="bookmark"
        pressed={saved}
        onClick={toggle}
      >
        {SAVE_TEXT.save}
      </Button>
      <span
        aria-live="polite"
        className={justSaved && saved ? "order-last basis-full type-meta text-meta" : "sr-only"}
      >
        {justSaved && saved && (
          <>
            {SAVE_TEXT.saved}{" "}
            <Link
              href="/favoritos"
              className="font-semibold text-link underline underline-offset-4"
            >
              {SAVE_TEXT.seeFavorites}
            </Link>
          </>
        )}
      </span>
    </span>
  );
}
