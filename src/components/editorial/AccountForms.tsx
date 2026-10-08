"use client";

import { useActionState, useId, useState } from "react";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { useAnonProfile } from "@/lib/anon/use-profile";
import {
  IDLE,
  type DeleteState,
  type ExportResult,
  type ProfileState,
} from "@/lib/auth/form-state";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { ListRow } from "../ui/ListRow";
import { Select } from "../ui/Select";
import { TextField } from "../ui/TextField";
import { useHydratedForm } from "../ui/useHydratedForm";
import { downloadJson } from "./download";

export interface ProfileDetailsFormProps {
  action: (state: ProfileState, form: FormData) => Promise<ProfileState>;
  name: string;
  email: string;
  neighborhood: string | null;
  /** Com ele, aparece "Cancelar" ao lado de "Salvar". */
  onCancel?: () => void;
}

/**
 * Nome de exibição, e-mail (só leitura) e bairro principal (P20). "Salvar" só fica ativo quando
 * algo mudou: sem mudança, não há o que enviar.
 */
export function ProfileDetailsForm({
  action,
  name,
  email,
  neighborhood,
  onCancel,
}: ProfileDetailsFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as ProfileState);
  const [value, setValue] = useState(name);
  const [hood, setHood] = useState(neighborhood ?? "");
  // Edição feita antes da hidratação (celular lento) não volta ao valor salvo.
  const { ref, ready } = useHydratedForm(({ text }) => {
    setValue((v) => text("name") ?? v);
    setHood((v) => text("neighborhood") ?? v);
  });
  const id = useId();
  const dirty = value.trim() !== name || hood !== (neighborhood ?? "");
  const options = [
    { value: "", label: T.account.none },
    ...(neighborhood && !NEIGHBORHOODS.some((n) => n.name === neighborhood)
      ? [{ value: neighborhood, label: neighborhood }]
      : []),
    ...NEIGHBORHOODS.map((n) => ({ value: n.name, label: n.name })),
  ];
  return (
    <form
      ref={ref}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
      data-ready={ready ? "true" : undefined}
    >
      <TextField
        id={`${id}-nome`}
        name="name"
        label={T.account.name}
        icon="user"
        maxLength={80}
        autoComplete="nickname"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={state.status === "invalid" ? T.account.nameError : undefined}
      />
      <div className="flex flex-col gap-1">
        <span className="type-label text-strong">{T.account.email}</span>
        <span className="type-body break-all text-body">{email}</span>
        <span className="type-meta text-meta">{T.account.emailHint}</span>
      </div>
      <div id="bairro" className="scroll-mt-8">
        <Select
          id={`${id}-bairro`}
          name="neighborhood"
          label={T.account.neighborhood}
          hint={T.account.neighborhoodHint}
          options={options}
          value={hood}
          onChange={setHood}
        />
      </div>
      {state.status === "unavailable" && (
        <InlineAlert tone="error" title={T.delete.error} role="alert" />
      )}
      <div className="flex flex-col gap-3">
        <Button type="submit" fullWidth disabled={pending || !dirty}>
          {T.account.save}
        </Button>
        {onCancel && (
          <Button fullWidth variant="outline" onClick={onCancel}>
            {T.account.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * "Baixar meus dados" (P20, LGPD): um arquivo só com o que a conta guarda e, em `browser`, o que
 * está neste navegador. As chaves da conta continuam na raiz do JSON.
 */
export function ExportAccountRow({ action }: { action: () => Promise<ExportResult> }) {
  const { profile } = useAnonProfile();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col">
      <ListRow
        icon="download"
        label={busy ? T.data.exporting : T.data.export}
        description={T.data.exportDetail}
        bordered={false}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setFailed(false);
          const r = await action().catch((): ExportResult => ({ ok: false }));
          setBusy(false);
          if (!r.ok) return setFailed(true);
          const account = JSON.parse(r.data) as Record<string, unknown>;
          downloadJson(
            "citynews-minha-conta.json",
            JSON.stringify({ ...account, browser: profile }, null, 2),
          );
        }}
      />
      {failed && (
        <div className="px-4 pb-4">
          <InlineAlert tone="error" title={T.data.exportError} role="alert" />
        </div>
      )}
    </div>
  );
}

export interface DeleteAccountFormProps {
  action: (state: DeleteState, form: FormData) => Promise<DeleteState>;
}

/** Confirmação da exclusão (P20): o botão só libera depois de digitar EXCLUIR. */
export function DeleteAccountForm({ action }: DeleteAccountFormProps) {
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(action, IDLE as DeleteState);
  const id = useId();
  const ok = typed.trim() === T.delete.word;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <TextField
        id={`${id}-confirmar`}
        name="confirm"
        label={T.delete.type}
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {state.status !== "idle" && <InlineAlert tone="error" title={T.delete.error} role="alert" />}
      <div className="flex flex-col gap-3">
        <Button type="submit" fullWidth disabled={!ok || pending}>
          {T.delete.confirm}
        </Button>
        <Button fullWidth variant="outline" href="/perfil">
          {T.delete.cancel}
        </Button>
      </div>
    </form>
  );
}
