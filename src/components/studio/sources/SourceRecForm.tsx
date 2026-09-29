"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT, LOGO_TEXT, REC_TAB_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import { SourceCard } from "../../editorial/SourceCard";
import { isConflict, type ActionFn, type ActionState } from "@/lib/sources/action-state";
import { Button } from "../../ui/Button";
import { ActionMessage, CheckboxField } from "./fields";

export interface SourceRecFormProps {
  source: {
    id: string;
    version: number;
    name: string;
    displayName: string | null;
    slug: string;
    logoUrl: string | null;
    locality: string;
    categories: string[];
    recPinned: boolean;
    recLocalHighlight: boolean;
    recExcluded: boolean;
    archived: boolean;
  };
  /** `updateSourceAction` (FS-T6): só os três campos de recomendação vão no envio. */
  action: ActionFn;
  rulesHref?: string;
}

/**
 * Aba Recomendação (spec §7.2, §8): nome e logotipo exibidos (mudam na Configuração), fixar,
 * destacar local, excluir da recomendação, com a explicação do teto de 25% e a prévia do
 * `SourceCard` como quem lê vê. Envia só os três campos (edição parcial por seção).
 */
export function SourceRecForm({
  source,
  action,
  rulesHref = "/estudio/control/recomendacao",
}: SourceRecFormProps) {
  const uid = useId().replace(/:/g, "");
  const [version, setVersion] = useState(source.version);
  const [pinned, setPinned] = useState(source.recPinned);
  const [local, setLocal] = useState(source.recLocalHighlight);
  const [excluded, setExcluded] = useState(source.recExcluded);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionState | null>(null);
  const shownName = source.displayName ?? source.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.set("id", source.id);
    form.set("version", String(version));
    form.set("recPinned", pinned ? "true" : "false");
    form.set("recLocalHighlight", local ? "true" : "false");
    form.set("recExcluded", excluded ? "true" : "false");
    setSaving(true);
    setResult(null);
    let r: ActionState;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setSaving(false);
    setResult(r);
    const v = r.ok ? (r.data as { version?: number } | undefined)?.version : undefined;
    if (typeof v === "number") setVersion(v);
  }
  const conflict = isConflict(result);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        noValidate
        className="flex min-w-0 flex-col gap-5 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <section className="flex flex-col gap-2">
          <h2 className="type-section text-strong">{T.displayed}</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="type-meta text-meta">{T.displayedName}</dt>
              <dd className="type-body font-semibold text-strong">{shownName}</dd>
            </div>
            <div>
              <dt className="type-meta text-meta">{T.displayedLogo}</dt>
              <dd className="type-body text-strong">
                {source.logoUrl ? (
                  <Image
                    src={source.logoUrl}
                    alt={LOGO_TEXT.current(shownName)}
                    width={48}
                    height={48}
                    className="size-12 rounded-md border border-line-section"
                    unoptimized
                  />
                ) : (
                  LOGO_TEXT.none
                )}
              </dd>
            </div>
          </dl>
          <p className="type-meta text-meta">{T.editInConfig}</p>
        </section>
        <fieldset disabled={source.archived} className="flex flex-col gap-3 border-0 p-0">
          <legend className="mb-2 type-section text-strong">{T.title}</legend>
          <CheckboxField
            id={`${uid}-pinned`}
            label={T.pinned}
            checked={pinned}
            onChange={setPinned}
            hint={T.pinnedHint}
          />
          <CheckboxField
            id={`${uid}-local`}
            label={T.localHighlight}
            checked={local}
            onChange={setLocal}
            hint={T.localHighlightHint}
          />
          <CheckboxField
            id={`${uid}-excluded`}
            label={T.excluded}
            checked={excluded}
            onChange={setExcluded}
            hint={T.excludedHint}
          />
        </fieldset>
        <p className="type-meta text-meta">
          {T.explanation}{" "}
          <Link href={rulesHref} className="text-link underline-offset-4 hover:underline">
            {T.rulesLink}
          </Link>
        </p>
        <ActionMessage result={result}>
          {conflict && (
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              {DETAIL_TEXT.actions.reload}
            </Button>
          )}
        </ActionMessage>
        {!source.archived && (
          <div>
            <Button type="submit" size="md" disabled={saving}>
              {saving ? T.saving : T.save}
            </Button>
          </div>
        )}
      </form>
      <aside aria-label={T.previewTitle} className="flex min-w-0 flex-col gap-3">
        <h2 className="type-section text-strong">{T.previewTitle}</h2>
        <SourceCard
          source={{
            slug: source.slug,
            name: shownName,
            href: `/fontes/${source.slug}`,
            logo: source.logoUrl ?? undefined,
            category: source.categories[0] ?? "",
            locality: LOCALITY_TEXT[source.locality] ?? source.locality,
            reason: T.previewReason,
            reach: 0,
            trend: "stable",
            itemsToday: 0,
            updatedAt: null,
            preferred: pinned,
          }}
          onFollow={() => undefined}
          onHide={() => undefined}
        />
      </aside>
    </div>
  );
}
