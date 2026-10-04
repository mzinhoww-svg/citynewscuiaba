"use client";

import { useActionState, useId, useState } from "react";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import {
  IDLE,
  type DeleteState,
  type ExportResult,
  type ProfileState,
} from "@/lib/auth/form-state";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { InlineAlert } from "../ui/InlineAlert";
import { Select } from "../ui/Select";
import { TextField } from "../ui/TextField";
import { useHydratedForm } from "../ui/useHydratedForm";
import { downloadJson } from "./LocalProfileCard";

export interface ProfileDetailsFormProps {
  action: (state: ProfileState, form: FormData) => Promise<ProfileState>;
  name: string;
  email: string;
  neighborhood: string | null;
}

/** Nome de exibição, e-mail (só leitura) e bairro principal (P20). */
export function ProfileDetailsForm({ action, name, email, neighborhood }: ProfileDetailsFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as ProfileState);
  const [value, setValue] = useState(name);
  const [hood, setHood] = useState(neighborhood ?? "");
  // Edição feita antes da hidratação (celular lento) não volta ao valor salvo.
  const { ref, ready } = useHydratedForm(({ text }) => {
    setValue((v) => text("name") ?? v);
    setHood((v) => text("neighborhood") ?? v);
  });
  const id = useId();
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
      <input type="hidden" name="current_neighborhood" value={neighborhood ?? ""} />
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
      <div className="flex flex-col gap-2">
        <span className="type-label text-strong">{T.account.email}</span>
        <span className="type-body break-all text-body">{email}</span>
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
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="md" disabled={pending}>
          {T.account.save}
        </Button>
        <p role="status" className="type-meta text-service">
          {state.status === "saved" ? T.account.saved : ""}
        </p>
      </div>
      {state.status === "unavailable" && (
        <InlineAlert tone="error" title={T.delete.error} role="alert" />
      )}
    </form>
  );
}

/** Exportar dados da conta em JSON (P20). */
export function ExportAccountButton({ action }: { action: () => Promise<ExportResult> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        size="md"
        variant="outline"
        icon="download"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const r = await action().catch((): ExportResult => ({ ok: false }));
          setBusy(false);
          if (r.ok) downloadJson("citynews-minha-conta.json", r.data);
          else setFailed(true);
        }}
      >
        {busy ? T.data.exporting : T.data.export}
      </Button>
      {failed && <InlineAlert tone="error" title={T.data.exportError} role="alert" />}
    </div>
  );
}

export interface DeleteAccountProps {
  action: (state: DeleteState, form: FormData) => Promise<DeleteState>;
}

/** Excluir conta (P20): diálogo que só libera o botão depois de digitar EXCLUIR. */
export function DeleteAccount({ action }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(action, IDLE as DeleteState);
  const id = useId();
  const ok = typed.trim() === T.delete.word;
  return (
    <>
      <Button size="md" variant="outline" onClick={() => setOpen(true)}>
        {T.delete.open}
      </Button>
      <Dialog
        open={open}
        title={T.delete.dialogTitle}
        onClose={() => {
          setOpen(false);
          setTyped("");
        }}
      >
        <form action={formAction} noValidate className="flex flex-col gap-5 text-left">
          <p>{T.delete.dialogBody}</p>
          <TextField
            id={`${id}-confirmar`}
            name="confirm"
            label={T.delete.type}
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          {state.status !== "idle" && (
            <InlineAlert tone="error" title={T.delete.error} role="alert" />
          )}
          <div className="flex flex-col gap-3">
            <Button type="submit" fullWidth disabled={!ok || pending}>
              {T.delete.confirm}
            </Button>
            <Button
              fullWidth
              variant="outline"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              {T.delete.cancel}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
