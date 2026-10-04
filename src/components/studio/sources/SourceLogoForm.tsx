"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { LOGO_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import type { WizardAction, WizardActionResult } from "./AddSourceWizard";
import { ActionMessage, describedBy, FieldShell } from "./fields";

export interface SourceLogoFormProps {
  source: { id: string; version: number; name: string; logoUrl: string | null; archived: boolean };
  /** `uploadLogoAction` (FS-T6). */
  action: WizardAction;
  /** `discoverLogoAction` (LOGO-T1): "Buscar logo" na internet. Sem ela, o botão não aparece. */
  discoverAction?: WizardAction;
  /** `removeLogoAction`: tira o logotipo a pedido da fonte. Sem ela, o botão não aparece. */
  removeAction?: WizardAction;
  className?: string;
}

/**
 * Logotipo da fonte (D-F25): PNG ou WebP quadrado, até 200 KB, do bucket `source-logos` — o único
 * lugar do painel onde `next/image` carrega imagem (nunca de terceiros).
 */
export function SourceLogoForm({
  source,
  action,
  discoverAction,
  removeAction,
  className,
}: SourceLogoFormProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<WizardActionResult | null>(null);
  const error = result && !result.ok ? (result.fieldErrors?.logo ?? null) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setResult({
        ok: false,
        message: SOURCE_ACTION_TEXT.logo.missing,
        fieldErrors: { logo: SOURCE_ACTION_TEXT.logo.missing },
      });
      return;
    }
    const form = new FormData();
    form.set("id", source.id);
    form.set("version", String(source.version));
    form.set("logo", file);
    setBusy(true);
    let r: WizardActionResult;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setBusy(false);
    setResult(r);
    if (r.ok) router.refresh();
  }

  async function runAction(
    fn: WizardAction,
    fields: Record<string, string>,
    busyFlag: (on: boolean) => void,
  ) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    busyFlag(true);
    let r: WizardActionResult;
    try {
      r = await fn(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    busyFlag(false);
    setResult(r);
    if (r.ok) router.refresh();
  }

  const discover = () =>
    discoverAction && runAction(discoverAction, { id: source.id }, setSearching);
  const remove = () =>
    removeAction &&
    runAction(removeAction, { id: source.id, version: String(source.version) }, setRemoving);
  const idle = !(busy || searching || removing);
  return (
    <form onSubmit={submit} noValidate className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex size-24 shrink-0 items-center justify-center rounded-md border border-line-section bg-section">
          {source.logoUrl ? (
            <Image
              src={source.logoUrl}
              alt={T.current(source.name)}
              width={96}
              height={96}
              className="size-24 rounded-md bg-branco object-contain p-1"
              unoptimized
            />
          ) : (
            <span className="px-2 text-center type-meta text-meta">{T.none}</span>
          )}
        </div>
        {!source.archived && (
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <FieldShell id={`${uid}-logo`} label={T.file} hint={T.hint} error={error}>
              <input
                id={`${uid}-logo`}
                type="file"
                accept="image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-describedby={describedBy(`${uid}-logo`, T.hint, error)}
                className="type-body text-strong"
              />
            </FieldShell>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="md" variant="outline" disabled={!idle}>
                {busy ? T.sending : T.send}
              </Button>
              {discoverAction && (
                <Button
                  type="button"
                  size="md"
                  variant="outline"
                  disabled={!idle}
                  onClick={discover}
                  aria-describedby={`${uid}-discover-hint`}
                >
                  {searching ? T.discovering : T.discover}
                </Button>
              )}
              {removeAction && source.logoUrl && (
                <Button type="button" size="md" variant="outline" disabled={!idle} onClick={remove}>
                  {removing ? T.removing : T.remove}
                </Button>
              )}
            </div>
            {discoverAction && (
              <p id={`${uid}-discover-hint`} className="type-meta text-meta">
                {T.discoverHint}
              </p>
            )}
            <ActionMessage result={result} />
          </div>
        )}
      </div>
    </form>
  );
}
