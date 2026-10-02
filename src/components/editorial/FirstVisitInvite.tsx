"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { FIRST_VISIT_TEXT as T } from "@/content/pt-BR/account";
import {
  QUALIFIED_READ_EVENT,
  decideFirstVisit,
  firstVisitDecided,
  qualifiedReadsThisSession,
} from "@/lib/anon/invite-storage";
import { shouldShowFirstVisit, type OnboardingGroup } from "@/lib/anon/invites";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { useInviteSlot } from "@/lib/app/slot";
import { hasAuthCookie } from "@/lib/auth/cookie";
import { useConsent } from "@/lib/consent/client";
import { useTrack } from "@/lib/events/use-track";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { FollowButton } from "./SourceCard";

type Pick = { slug: string; name: string; group: OnboardingGroup };
type Load = { state: "idle" | "loading" | "error" } | { state: "ready"; sources: Pick[] };
const GROUPS: readonly OnboardingGroup[] = ["local", "state", "theme"];

/**
 * Painel da primeira visita (P23): depois de 3 leituras qualificadas na sessão, um painel
 * lateral não modal (canto inferior no desktop, acima da barra no mobile) convida a escolher
 * fontes. Aparece só com a escolha de privacidade feita (o banner já saiu), sem conta, sem
 * fontes seguidas e enquanto o leitor não decidiu. Qualquer das três ações conta como decisão.
 */
export function FirstVisitInvite() {
  const [consent] = useConsent();
  const { profile, act } = useAnonProfile();
  const send = useTrack();
  const router = useRouter();
  const [reads, setReads] = useState(0);
  const [closed, setClosed] = useState(true);
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const titleId = useId();
  const pickerTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Lê o que ficou no navegador depois de montar (servidor e hidratação não têm acesso).
    const sync = () => {
      setReads(qualifiedReadsThisSession());
      setClosed(firstVisitDecided() || hasAuthCookie(document.cookie));
    };
    sync();
    window.addEventListener(QUALIFIED_READ_EVENT, sync);
    return () => window.removeEventListener(QUALIFIED_READ_EVENT, sync);
  }, []);

  const follows = profile?.follows.filter((f) => f.kind === "source") ?? [];
  const decided = closed || (profile !== null && load.state === "idle" && follows.length > 0);
  const visible = consent.decided && profile !== null && shouldShowFirstVisit(reads, decided);
  // Painel da primeira visita ocupa a vaga de "consentimento" (vem logo depois do banner).
  useInviteSlot("consent", visible);

  useEffect(() => {
    if (load.state === "ready") pickerTitle.current?.focus();
  }, [load.state]);

  if (!visible) return null;

  const finish = () => {
    decideFirstVisit();
    setClosed(true);
  };
  const fetchSources = async () => {
    setLoad({ state: "loading" });
    try {
      const res = await fetch("/api/fontes/onboarding");
      const body = (await res.json()) as { sources?: Pick[] };
      if (!res.ok || !body.sources?.length) throw new Error("sem fontes");
      setLoad({ state: "ready", sources: body.sources });
    } catch {
      setLoad({ state: "error" });
    }
  };
  const followed = new Set(follows.map((f) => f.id));

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") finish();
      }}
      className="fixed inset-x-0 bottom-tabbar-safe z-sheet border-t border-line-strong bg-card-white lg:inset-x-auto lg:right-gutter lg:bottom-gutter lg:w-96 lg:rounded-lg lg:border lg:shadow-dialog"
    >
      <div className="mx-auto flex max-h-[70dvh] w-full max-w-page flex-col gap-3 overflow-y-auto px-gutter py-4 lg:px-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="type-label text-strong">
            {T.title}
          </h2>
          <IconButton icon="x" variant="ghost" size={44} label={T.close} onClick={finish} />
        </div>

        {load.state === "ready" ? (
          <section aria-labelledby={`${titleId}-picker`} className="flex flex-col gap-3">
            <h3
              id={`${titleId}-picker`}
              ref={pickerTitle}
              tabIndex={-1}
              className="type-label text-strong"
            >
              {T.pickerTitle}
            </h3>
            <p className="type-meta text-meta">{T.pickerIntro}</p>
            {GROUPS.map((g) => {
              const list = load.sources.filter((s) => s.group === g);
              if (list.length === 0) return null;
              return (
                <div key={g} className="flex flex-col gap-2">
                  <h4 className="type-meta font-semibold text-strong">{T.groups[g]}</h4>
                  <ul className="flex flex-col">
                    {list.map((s) => (
                      <li
                        key={s.slug}
                        className="flex items-center justify-between gap-3 border-b border-line-subtle py-2 last:border-b-0"
                      >
                        <span className="type-body text-strong">{s.name}</span>
                        <FollowButton
                          size="sm"
                          source={{ slug: s.slug, name: s.name, followed: followed.has(s.slug) }}
                          onFollow={(slug, next) =>
                            void act((store) =>
                              next
                                ? store.follow("source", slug, s.name)
                                : store.unfollow("source", slug),
                            ).then(() =>
                              next
                                ? send(
                                    "source_followed",
                                    { surface: "fontes", fromRecommendation: true },
                                    { sourceId: slug },
                                  )
                                : send(
                                    "source_unfollowed",
                                    { surface: "fontes" },
                                    { sourceId: slug },
                                  ),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p role="status" className="type-meta text-meta">
              {T.followed(followed.size)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="md" onClick={finish}>
                {T.done}
              </Button>
              <Button size="md" variant="text" href="/fontes">
                {T.seeAll}
              </Button>
            </div>
          </section>
        ) : (
          <>
            {load.state === "error" && (
              <p role="alert" className="type-meta text-danger">
                {T.error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button
                size="md"
                fullWidth
                disabled={load.state === "loading"}
                onClick={() => void fetchSources()}
              >
                {load.state === "error" ? T.retry : load.state === "loading" ? T.loading : T.choose}
              </Button>
              <Button size="md" variant="secondary" fullWidth onClick={finish}>
                {T.skip}
              </Button>
              <Button
                size="md"
                variant="outline"
                fullWidth
                onClick={() => {
                  finish();
                  router.push("/entrar?next=%2Ffontes");
                }}
              >
                {T.account}
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
