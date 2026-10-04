"use client";

import { useState } from "react";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { useAnonProfile } from "@/lib/anon/use-profile";
import type { ProfileState } from "@/lib/auth/form-state";
import { formatLongDate } from "@/lib/format/date";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { ListRow } from "../ui/ListRow";
import { ProfileDetailsForm } from "./AccountForms";
import { downloadJson } from "./download";

export interface EditProfileProps {
  action: (state: ProfileState, form: FormData) => Promise<ProfileState>;
  name: string;
  email: string;
  neighborhood: string | null;
}

/** "Editar perfil": nome e bairro numa folha; a página fica só para ler e navegar. */
export function EditProfile({ action, name, email, neighborhood }: EditProfileProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // Salvou: fecha a folha e avisa na página (o servidor já revalidou o nome e o bairro).
  const save = async (state: ProfileState, form: FormData) => {
    const next = await action(state, form);
    if (next.status === "saved") {
      setOpen(false);
      setSaved(true);
    }
    return next;
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="md"
        icon="pencil"
        fullWidth
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        {T.account.edit}
      </Button>
      <p role="status" className="type-meta text-service empty:hidden">
        {saved ? T.account.saved : ""}
      </p>
      <BottomSheet open={open} title={T.account.editTitle} onClose={() => setOpen(false)}>
        <ProfileDetailsForm
          action={save}
          name={name}
          email={email}
          neighborhood={neighborhood}
          onCancel={() => setOpen(false)}
        />
      </BottomSheet>
    </div>
  );
}

/**
 * Favoritos e Alertas com o que está guardado. As contagens vêm deste navegador, a mesma fonte
 * que `/favoritos` e `/alertas` mostram.
 */
export function ProfileActivityRows() {
  const { profile } = useAnonProfile();
  const favorites = profile
    ? [
        T.count.saved(profile.saved.length),
        T.count.follows(profile.follows.length),
        T.count.collections(profile.collections.length),
      ].join(" · ")
    : undefined;
  return (
    <>
      <ListRow
        icon="bookmark"
        label={T.links.favorites}
        description={favorites}
        href="/favoritos"
        bordered={false}
      />
      <ListRow
        icon="bell"
        label={T.links.alerts}
        description={profile ? T.count.alerts(profile.alerts.length) : undefined}
        href="/alertas"
        bordered={false}
      />
    </>
  );
}

function downloadBrowserData(profile: unknown) {
  downloadJson("citynews-este-navegador.json", JSON.stringify(profile, null, 2));
}

/** Sem conta: baixa só o que está neste navegador (nada vai ao servidor). */
export function BrowserExportRow() {
  const { profile } = useAnonProfile();
  return (
    <ListRow
      icon="download"
      label={T.anon.export}
      bordered={false}
      trailing={null}
      onClick={() => profile && downloadBrowserData(profile)}
    />
  );
}

/**
 * O que fica só neste navegador: identificador local e data, recolhidos (é detalhe técnico, não
 * informação do dia a dia). Com conta, também baixa esse pedaço sozinho.
 */
export function BrowserDataDetails({ signedIn }: { signedIn: boolean }) {
  const { profile, degraded } = useAnonProfile();
  return (
    <details className="group">
      <summary className="flex min-h-input cursor-pointer list-none items-center gap-3.5 px-4 py-2.5 text-strong hover:bg-section [&::-webkit-details-marker]:hidden">
        <Icon name={signedIn ? "layers" : "info"} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-16 font-medium leading-snug">
            {signedIn ? T.data.browser : T.data.technical}
          </span>
          {signedIn && (
            <span className="text-14 leading-snug text-meta">{T.data.browserDetail}</span>
          )}
        </span>
        <Icon
          name="chevron-down"
          size={20}
          color="var(--text-placeholder)"
          className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <dl className="grid grid-cols-1 gap-1">
          <dt className="type-label text-strong">{T.anon.localId}</dt>
          <dd className="mb-2 type-meta break-all text-meta">
            {profile ? (profile.anonId ?? T.anon.noId) : T.loading}
          </dd>
          <dt className="type-label text-strong">{T.anon.createdAt}</dt>
          <dd className="type-meta text-meta">
            {profile ? formatLongDate(profile.createdAt) : T.loading}
          </dd>
        </dl>
        {degraded && (
          <InlineAlert tone="warn" title={ANON_TEXT.degraded} role="none">
            <p>{ANON_TEXT.degradedDetail}</p>
          </InlineAlert>
        )}
        {signedIn && (
          <Button
            size="md"
            variant="text"
            icon="download"
            className="self-start"
            disabled={!profile}
            onClick={() => downloadBrowserData(profile)}
          >
            {T.anon.export}
          </Button>
        )}
      </div>
    </details>
  );
}

/** Aviso de perda (sem conta) ou de armazenamento indisponível. */
export function BrowserLossNote() {
  const { degraded } = useAnonProfile();
  if (degraded)
    return (
      <InlineAlert tone="warn" title={ANON_TEXT.degraded} role="none">
        <p>{ANON_TEXT.degradedDetail}</p>
      </InlineAlert>
    );
  return (
    <p className="flex items-start gap-2 type-meta text-meta">
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      {T.anon.loss}
    </p>
  );
}
