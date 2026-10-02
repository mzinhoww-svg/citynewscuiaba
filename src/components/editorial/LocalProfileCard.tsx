"use client";

import { PROFILE_TEXT } from "@/content/pt-BR/account";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { formatLongDate } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";

const T = PROFILE_TEXT.anon;

export interface LocalProfileCardProps {
  /** Com conta, o convite para criar conta some. */
  signedIn: boolean;
}

/** Baixa um arquivo gerado no navegador (nada vai ao servidor). */
export function downloadJson(name: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revogar logo depois do clique cancela o download no Safari e no Firefox (gate P2, M8).
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * "Seu perfil neste navegador" (P20): identificador local, data de criação, contagens, aviso de
 * perda e, sem conta, "Criar conta para sincronizar". O download leva só o que está aqui.
 */
export function LocalProfileCard({ signedIn }: LocalProfileCardProps) {
  const { profile, degraded, ready } = useAnonProfile();
  if (!ready || !profile) {
    return (
      <div
        aria-busy="true"
        className="flex flex-col gap-3 border border-line-section bg-card-white p-5"
      >
        <p className="type-meta text-meta">{PROFILE_TEXT.loading}</p>
        <Skeleton lines={3} />
      </div>
    );
  }
  const counts = [
    T.count.follows(profile.follows.length),
    T.count.saved(profile.saved.length),
    T.count.alerts(profile.alerts.length),
    T.count.collections(profile.collections.length),
  ];
  return (
    <section
      aria-labelledby="perfil-local"
      data-ready="true"
      className="flex flex-col gap-4 border border-line-section bg-card-white p-5"
    >
      <h2 id="perfil-local" className="type-section text-strong">
        {T.title}
      </h2>
      <p className="type-body text-body">{T.intro}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="type-label text-strong">{T.localId}</dt>
        <dd className="type-meta break-all text-meta">{profile.anonId ?? T.noId}</dd>
        <dt className="type-label text-strong">{T.createdAt}</dt>
        <dd className="type-meta text-meta">{formatLongDate(profile.createdAt)}</dd>
        <dt className="type-label text-strong">{T.counts}</dt>
        <dd className="type-meta text-meta">{counts.join(" · ")}</dd>
      </dl>
      {degraded ? (
        <InlineAlert tone="warn" title={ANON_TEXT.degraded} role="none">
          <p>{ANON_TEXT.degradedDetail}</p>
        </InlineAlert>
      ) : (
        <p className="type-meta text-meta">{T.loss}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {!signedIn && (
          <>
            <Button size="md" href="/criar-conta?next=%2Fperfil">
              {T.create}
            </Button>
            <Button size="md" variant="outline" href="/entrar?next=%2Fperfil">
              {T.signIn}
            </Button>
          </>
        )}
        <Button
          size="md"
          variant="text"
          icon="download"
          onClick={() =>
            downloadJson("citynews-este-navegador.json", JSON.stringify(profile, null, 2))
          }
        >
          {T.export}
        </Button>
      </div>
    </section>
  );
}
