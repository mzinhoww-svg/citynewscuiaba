"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import type { TaxonomyOverview } from "@/lib/db/queries/admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, type AdminReply } from "./AdminStatus";

export interface TaxonomyPanelProps {
  data: TaxonomyOverview;
  createSection: (i: { name: string; parentSlug: string }) => Promise<AdminReply>;
  renameSection: (i: { slug: string; name: string }) => Promise<AdminReply>;
  createPlace: (i: {
    name: string;
    kind: "bairro" | "municipio";
    inPhrase: string;
  }) => Promise<AdminReply>;
  togglePlace: (i: { slug: string; active: boolean }) => Promise<AdminReply>;
  mergeTags: (i: { from: string; into: string }) => Promise<AdminReply>;
}

const X = T.taxonomy;
type Open =
  | { kind: "section" }
  | { kind: "rename"; slug: string; name: string }
  | { kind: "place" }
  | { kind: "merge"; from: string; into: string };

/**
 * Taxonomia (A05): editorias e subeditorias, tags em uso com sugestões de mesclagem
 * (acento, caixa, espaço, plural) e lugares. Mesclar preserva vínculos e pede confirmação.
 */
export function TaxonomyPanel({
  data,
  createSection,
  renameSection,
  createPlace,
  togglePlace,
  mergeTags,
}: TaxonomyPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, start] = useTransition();
  const uid = useId().replace(/:/g, "");
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) {
      setOpen(null);
      router.refresh();
    }
  };
  const parents = data.sections.filter((s) => !s.parentSlug);
  const nameOf = (slug: string) => data.sections.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <div className="flex flex-col gap-10">
      <AdminStatus status={status} />

      <section aria-labelledby={`${uid}-sec`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-sec`} className="type-section text-strong">
            {X.sections}
          </h2>
          <Button
            size="sm"
            variant="outline"
            icon="plus"
            onClick={() => setOpen({ kind: "section" })}
          >
            {X.addSection}
          </Button>
        </div>
        <AdminTable
          caption={X.sectionsTable}
          headers={[X.col.section, X.col.slug, X.col.parent, X.col.category, T.users.col.actions]}
        >
          {data.sections.map((s) => (
            <tr key={s.slug} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {s.name}
              </th>
              <td className="px-3 py-3 type-body text-body">/{s.slug}</td>
              <td className="px-3 py-3 type-body text-body">
                {s.parentSlug ? nameOf(s.parentSlug) : T.none}
              </td>
              <td className="px-3 py-3 type-body text-body">{s.autonomyCategory}</td>
              <td className="px-3 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen({ kind: "rename", slug: s.slug, name: s.name })}
                >
                  {X.renameSection}
                </Button>
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>

      <section aria-labelledby={`${uid}-tags`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-tags`} className="type-section text-strong">
            {X.tags}
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen({ kind: "merge", from: "", into: "" })}
          >
            {X.mergeManual}
          </Button>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4">
          <h3 className="type-body font-semibold text-strong">{X.suggestions}</h3>
          <p className="type-meta text-meta">{X.suggestionsIntro}</p>
          {data.suggestions.length === 0 ? (
            <p className="type-body text-meta">{X.suggestionsEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-subtle">
              {data.suggestions.flatMap((s) =>
                s.from.map((from) => (
                  <li
                    key={`${from}→${s.into}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="type-body text-strong">
                      {X.mergeInto(from, s.into)}
                      <span className="ml-2 type-meta text-meta">({X.reason[s.reason]})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline-strong"
                      onClick={() => setOpen({ kind: "merge", from, into: s.into })}
                    >
                      {X.merge}
                    </Button>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
        {data.tags.length === 0 ? (
          <EmptyState title={X.tagsEmpty} />
        ) : (
          <AdminTable
            caption={X.tagsTable}
            headers={[X.tagCol.tag, X.tagCol.articles, X.tagCol.items]}
            minWidth="min-w-[24rem]"
          >
            {data.tags.map((t) => (
              <tr key={t.tag} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                  {t.tag}
                </th>
                <td className="px-3 py-2 type-body text-body tabular-nums">{t.articles}</td>
                <td className="px-3 py-2 type-body text-body tabular-nums">{t.items}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section aria-labelledby={`${uid}-places`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-places`} className="type-section text-strong">
            {X.places}
          </h2>
          <Button
            size="sm"
            variant="outline"
            icon="plus"
            onClick={() => setOpen({ kind: "place" })}
          >
            {X.addPlace}
          </Button>
        </div>
        <AdminTable
          caption={X.placesTable}
          headers={[
            X.placeCol.name,
            X.placeCol.kind,
            X.placeCol.slug,
            X.placeCol.phrase,
            X.placeCol.status,
            T.users.col.actions,
          ]}
        >
          {data.places.map((p) => (
            <tr key={p.slug} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                {p.name}
              </th>
              <td className="px-3 py-2 type-body text-body">{X.kind[p.kind]}</td>
              <td className="px-3 py-2 type-body text-body">{p.slug}</td>
              <td className="px-3 py-2 type-body text-body">{p.inPhrase}</td>
              <td className="px-3 py-2 type-body text-body">{p.active ? X.active : X.inactive}</td>
              <td className="px-3 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    start(async () => done(await togglePlace({ slug: p.slug, active: !p.active })))
                  }
                >
                  {X.togglePlace(p.active)}
                </Button>
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>

      {open?.kind === "section" && (
        <SectionDialog
          parents={parents}
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await createSection(v)))}
        />
      )}
      {open?.kind === "rename" && (
        <RenameDialog
          current={open}
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(name) =>
            start(async () => done(await renameSection({ slug: open.slug, name })))
          }
        />
      )}
      {open?.kind === "place" && (
        <PlaceDialog
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await createPlace(v)))}
        />
      )}
      {open?.kind === "merge" && (
        <MergeDialog
          initial={open}
          tags={data.tags.map((t) => t.tag)}
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await mergeTags(v)))}
        />
      )}
    </div>
  );
}

function Actions({
  busy,
  onCancel,
  submit,
  ready,
}: {
  busy: boolean;
  onCancel: () => void;
  submit: string;
  ready: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2.5">
      <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
        {T.cancel}
      </Button>
      <Button size="md" type="submit" disabled={!ready || busy}>
        {submit}
      </Button>
    </div>
  );
}

function SectionDialog({
  parents,
  busy,
  onCancel,
  onSubmit,
}: {
  parents: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; parentSlug: string }) => void;
}) {
  const D = X.sectionDialog;
  const uid = useId().replace(/:/g, "");
  const [name, setName] = useState("");
  const [parent, setParent] = useState(parents[0]?.slug ?? "");
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), parentSlug: parent });
        }}
      >
        <TextField
          id={`${uid}-nome`}
          label={D.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          id={`${uid}-mae`}
          name="mae"
          label={D.parent}
          options={parents.map((p) => ({ value: p.slug, label: p.name }))}
          value={parent}
          onChange={setParent}
        />
        <Actions
          busy={busy}
          onCancel={onCancel}
          submit={D.submit}
          ready={name.trim().length >= 2 && parent !== ""}
        />
      </form>
    </Dialog>
  );
}

function RenameDialog({
  current,
  busy,
  onCancel,
  onSubmit,
}: {
  current: { name: string };
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const D = X.renameDialog;
  const uid = useId().replace(/:/g, "");
  const [name, setName] = useState(current.name);
  return (
    <Dialog open title={D.title(current.name)} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name.trim());
        }}
      >
        <TextField
          id={`${uid}-nome`}
          label={D.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Actions
          busy={busy}
          onCancel={onCancel}
          submit={D.submit}
          ready={name.trim().length >= 2 && name.trim() !== current.name}
        />
      </form>
    </Dialog>
  );
}

function PlaceDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; kind: "bairro" | "municipio"; inPhrase: string }) => void;
}) {
  const D = X.placeDialog;
  const uid = useId().replace(/:/g, "");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"bairro" | "municipio">("bairro");
  const [phrase, setPhrase] = useState("");
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), kind, inPhrase: phrase.trim() });
        }}
      >
        <TextField
          id={`${uid}-nome`}
          label={D.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          id={`${uid}-tipo`}
          name="tipo"
          label={D.kind}
          options={[
            { value: "bairro", label: X.kind.bairro },
            { value: "municipio", label: X.kind.municipio },
          ]}
          value={kind}
          onChange={(v) => setKind(v === "municipio" ? "municipio" : "bairro")}
        />
        <TextField
          id={`${uid}-frase`}
          label={D.phrase}
          hint={D.phraseHint}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          required
        />
        <Actions
          busy={busy}
          onCancel={onCancel}
          submit={D.submit}
          ready={name.trim().length >= 2 && phrase.trim().length >= 2}
        />
      </form>
    </Dialog>
  );
}

function MergeDialog({
  initial,
  tags,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: { from: string; into: string };
  tags: string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { from: string; into: string }) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [from, setFrom] = useState(initial.from);
  const [into, setInto] = useState(initial.into);
  const options = tags.map((t) => ({ value: t, label: t }));
  const ready = from !== "" && into !== "" && from !== into;
  return (
    <Dialog open title={ready ? X.mergeInto(from, into) : X.mergeManual} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ from, into });
        }}
      >
        <Select
          id={`${uid}-de`}
          name="de"
          label={X.mergeFrom}
          options={options}
          placeholder={T.none}
          value={from}
          onChange={setFrom}
        />
        <Select
          id={`${uid}-para`}
          name="para"
          label={X.mergeTo}
          options={options}
          placeholder={T.none}
          value={into}
          onChange={setInto}
        />
        <p className="type-meta text-meta">{X.suggestionsIntro}</p>
        <Actions busy={busy} onCancel={onCancel} submit={X.merge} ready={ready} />
      </form>
    </Dialog>
  );
}
