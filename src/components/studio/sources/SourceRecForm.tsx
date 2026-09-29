"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { REC as T } from "@/content/pt-BR/sources-admin-detail";
import { SourceAvatar } from "../../editorial/SourceAvatar";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { InlineAlert } from "../../ui/InlineAlert";
import { ActionMessage, formDataOf, useFormAction, type FormAction } from "./detail-shared";

export interface SourceRecFormProps {
  id: string;
  version: number;
  name: string;
  displayName: string | null;
  /** Endereço público do logotipo (bucket `source-logos`); `null` mostra o monograma. */
  logoUrl: string | null;
  pinned: boolean;
  localHighlight: boolean;
  excluded: boolean;
  archived: boolean;
  /** Ação da recomendação: `id`, `version`, `displayName`, `recPinned`, `recLocalHighlight`, `recExcluded`. */
  action: FormAction;
  /** `uploadLogoAction`: `id`, `version`, `file`. */
  logoAction: FormAction;
  /** Endereço da tela de pesos e campanhas (O17). */
  weightsHref: string;
}

/**
 * Aba Recomendação (O04, plano P5-T4): nome e logotipo exibidos, fixar, destacar como local e
 * excluir da recomendação. Cada mudança é auditada pelo banco. Fixar conta no teto de 25% por
 * fonte (a explicação fica visível ao lado da caixa).
 */
export function SourceRecForm({
  id,
  version,
  name,
  displayName,
  logoUrl,
  pinned,
  localHighlight,
  excluded,
  archived,
  action,
  logoAction,
  weightsHref,
}: SourceRecFormProps) {
  const uid = useId();
  const save = useFormAction(action);
  const logo = useFormAction(logoAction);
  const [shown, setShown] = useState(displayName ?? "");
  const errors = save.state && !save.state.ok ? save.state.fieldErrors : undefined;
  const logoErrors = logo.state && !logo.state.ok ? logo.state.fieldErrors : undefined;

  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (archived || save.pending) return;
    save.submit(formDataOf(e.currentTarget));
  };
  const onLogo = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (archived || logo.pending) return;
    logo.submit(formDataOf(e.currentTarget));
  };

  return (
    <div className="flex flex-col gap-8">
      <p className="type-body text-meta">{T.intro}</p>
      {archived && (
        <InlineAlert tone="info" role="none">
          A fonte está arquivada. Restaure para editar.
        </InlineAlert>
      )}

      <section aria-labelledby={`${uid}-prev`} className="flex flex-col gap-3">
        <h2 id={`${uid}-prev`} className="type-section text-strong">
          {T.previewTitle}
        </h2>
        <div
          role="group"
          aria-label={T.previewLabel}
          className="flex items-center gap-4 rounded-lg border border-line-section bg-card-white p-4"
        >
          <SourceAvatar
            name={shown.trim() || name}
            {...(logoUrl ? { image: logoUrl } : {})}
            size={56}
          />
          <div className="flex flex-col">
            <span className="type-body font-semibold text-strong">{shown.trim() || name}</span>
            <span className="type-meta text-meta">
              {logoUrl ? T.logoCurrent(name) : T.logoNone}
            </span>
          </div>
        </div>
      </section>

      <form onSubmit={onSave} noValidate className="flex flex-col gap-6" aria-label={T.title}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-nome`} className="type-label text-16 text-strong">
            {T.displayName}
          </label>
          <input
            id={`${uid}-nome`}
            name="displayName"
            type="text"
            value={shown}
            maxLength={60}
            disabled={archived}
            onChange={(e) => setShown(e.target.value)}
            aria-describedby={`${uid}-nome-dica`}
            aria-invalid={errors?.displayName ? true : undefined}
            className="border-control control-field h-input w-full rounded-lg bg-input px-4 type-body text-strong disabled:opacity-60"
          />
          <p id={`${uid}-nome-dica`} className="type-meta text-meta">
            {T.displayNameHint}
          </p>
          {errors?.displayName && (
            <p className="flex items-start gap-1.5 type-meta text-danger">
              <Icon name="circle-alert" size={16} />
              {errors.displayName}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-4" disabled={archived}>
          <legend className="mb-1 type-label text-16 text-strong">{T.title}</legend>
          {(
            [
              ["recPinned", T.pinned, T.pinnedHint, pinned],
              ["recLocalHighlight", T.localHighlight, T.localHighlightHint, localHighlight],
              ["recExcluded", T.excluded, T.excludedHint, excluded],
            ] as const
          ).map(([field, label, hint, value]) => (
            <div key={field} className="flex flex-col gap-1">
              <input type="hidden" name={field} value="false" />
              <label className="flex min-h-tap items-center gap-3 type-body text-strong">
                <input
                  type="checkbox"
                  name={field}
                  value="true"
                  defaultChecked={value}
                  aria-describedby={`${uid}-${field}`}
                  className="size-5 accent-(--action-primary)"
                />
                {label}
              </label>
              <p id={`${uid}-${field}`} className="pl-8 type-meta text-meta">
                {hint}
              </p>
            </div>
          ))}
        </fieldset>

        <ActionMessage state={save.state} />
        {!archived && (
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="md" disabled={save.pending}>
              {T.save}
            </Button>
            <Link
              href={weightsHref}
              className="inline-flex min-h-tap items-center gap-1 type-body text-link underline underline-offset-4 hover:text-strong"
            >
              {T.weights}
            </Link>
          </div>
        )}
      </form>

      <form
        onSubmit={onLogo}
        noValidate
        aria-labelledby={`${uid}-logo`}
        className="flex flex-col gap-3"
      >
        <h2 id={`${uid}-logo`} className="type-section text-strong">
          {T.logo}
        </h2>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-file`} className="type-label text-16 text-strong">
            {T.logoUpload}
          </label>
          <input
            id={`${uid}-file`}
            name="file"
            type="file"
            accept="image/png,image/webp"
            disabled={archived}
            aria-describedby={`${uid}-file-dica`}
            aria-invalid={logoErrors?.file ? true : undefined}
            className="min-h-tap type-body text-strong"
          />
          <p id={`${uid}-file-dica`} className="type-meta text-meta">
            {T.logoHint}
          </p>
          {logoErrors?.file && (
            <p className="flex items-start gap-1.5 type-meta text-danger">
              <Icon name="circle-alert" size={16} />
              {logoErrors.file}
            </p>
          )}
        </div>
        <ActionMessage state={logo.state} />
        {!archived && (
          <div>
            <Button type="submit" size="md" variant="outline" disabled={logo.pending}>
              {T.logoUpload}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
