"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { DATA_SOURCE_LABEL, GUIDE_ADMIN_TEXT } from "@/content/pt-BR/guide";
import { formatWhen } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Panel } from "../../ui/Panel";
import { Select } from "../../ui/Select";
import { TextArea } from "../../ui/TextArea";
import { TextField } from "../../ui/TextField";
import { AdminStatus, CheckList, type AdminReply } from "../admin/AdminStatus";
import { AdjustDialog, type AdjustPayload, type VenueChoice } from "./AdjustDialog";
import type { AdminProposal, CategoryOption } from "./types";

const T = GUIDE_ADMIN_TEXT.proposals;
const SIGNAL = T.signal;

export interface ProposalsPanelProps {
  proposals: AdminProposal[];
  categories: CategoryOption[];
  venues: VenueChoice[];
  byLink: (i: { url: string; category: string | null }) => Promise<AdminReply>;
  manual: (i: {
    title: string;
    category: string;
    neighborhood: string | null;
    venueIds: string[];
    criteria?: string;
  }) => Promise<AdminReply>;
  publish: (i: { id: string }) => Promise<AdminReply>;
  discard: (i: { id: string; reason: string }) => Promise<AdminReply>;
  adjust: (i: AdjustPayload) => Promise<AdminReply>;
}

const sourceNames = (sources: readonly string[]) =>
  sources.map((s) => DATA_SOURCE_LABEL[s as keyof typeof DATA_SOURCE_LABEL] ?? s).join(", ");

/**
 * Propostas (GUIA-T5): cartão por proposta com pontuação por lugar, "Como escolhemos" e os
 * botões Publicar, Ajustar e Descartar; "Propor por link" e "Propor manualmente" no topo.
 */
export function ProposalsPanel(props: ProposalsPanelProps) {
  const { proposals, categories, venues } = props;
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "link" }
    | { kind: "manual" }
    | { kind: "adjust"; id: string }
    | { kind: "discard"; id: string }
    | null
  >(null);
  const [dialogError, setDialogError] = useState<AdminReply | null>(null);
  const [busy, start] = useTransition();

  const done = (r: AdminReply) => {
    setStatus(r);
    setDialogError(null);
    if (r.ok) {
      setDialog(null);
      router.refresh();
    } else if (dialog) setDialogError(r);
  };
  const run = (fn: () => Promise<AdminReply>) => start(async () => done(await fn()));
  const current = dialog && "id" in dialog ? proposals.find((p) => p.list.id === dialog.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <div className="flex flex-wrap gap-3">
          <Button
            size="md"
            variant="outline"
            icon="link"
            onClick={() => setDialog({ kind: "link" })}
          >
            {T.byLink}
          </Button>
          <Button size="md" icon="plus" onClick={() => setDialog({ kind: "manual" })}>
            {T.manual}
          </Button>
        </div>
      </div>

      {proposals.length === 0 ? (
        <EmptyState title={T.empty}>
          <p>{T.emptyHint}</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-6">
          {proposals.map((p) => (
            <li key={p.id}>
              <ProposalCard
                p={p}
                busy={busy}
                onPublish={() => run(() => props.publish({ id: p.list.id }))}
                onAdjust={() => setDialog({ kind: "adjust", id: p.list.id })}
                onDiscard={() => setDialog({ kind: "discard", id: p.list.id })}
              />
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "link" && (
        <LinkDialog
          categories={categories}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.byLink(v))}
        />
      )}
      {dialog?.kind === "manual" && (
        <ManualDialog
          categories={categories}
          venues={venues}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.manual(v))}
        />
      )}
      {dialog?.kind === "adjust" && current && (
        <AdjustDialog
          list={current.list}
          candidates={venues}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.adjust(v))}
        />
      )}
      {dialog?.kind === "discard" && current && (
        <ReasonDialog
          title={T.discardTitle}
          label={T.discardReason}
          confirm={T.discardConfirm}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(() => props.discard({ id: current.list.id, reason }))}
        />
      )}
    </div>
  );
}

function ProposalCard({
  p,
  busy,
  onPublish,
  onAdjust,
  onDiscard,
}: {
  p: AdminProposal;
  busy: boolean;
  onPublish: () => void;
  onAdjust: () => void;
  onDiscard: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const l = p.list;
  const missing = p.analysis?.missingForAutoPublish ?? [];
  const sources = [...new Set(l.items.flatMap((i) => i.sources))];
  return (
    <Panel as="article" aria-labelledby={`${uid}-t`} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="type-eyebrow text-service">{T.origin[p.origin]}</p>
        <h3 id={`${uid}-t`} className="type-section text-strong">
          {l.title}
        </h3>
        <p className="type-meta text-meta">
          {formatWhen(p.createdAt)} · {T.sources}: {sourceNames(sources)}
        </p>
        {missing.length > 0 && (
          <p className="type-meta text-meta">{T.missingNote(missing.join(", "))}</p>
        )}
      </header>

      <section aria-labelledby={`${uid}-c`} className="flex flex-col gap-1">
        <h4 id={`${uid}-c`} className="type-meta font-semibold text-strong">
          {T.criteria}
        </h4>
        <p className="type-body text-body">{l.criteria}</p>
      </section>

      <ol className="flex flex-col divide-y divide-line-subtle rounded-md border border-line-subtle">
        {l.items.map((i) => (
          <li key={i.venueId} className="flex flex-col gap-1 px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="type-body text-strong">
                <span className="tabular-nums">{i.position}.</span> {i.name}
                {i.neighborhood ? <span className="text-meta"> · {i.neighborhood}</span> : null}
              </p>
              <p className="type-meta text-meta tabular-nums">
                {T.score}: {i.score.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              </p>
            </div>
            <details>
              <summary className="cursor-pointer type-meta text-link">{T.breakdown}</summary>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta">
                {(Object.keys(SIGNAL) as (keyof typeof SIGNAL)[]).map((k) => (
                  <li key={k} className="tabular-nums">
                    {SIGNAL[k]}:{" "}
                    {(i.breakdown[k] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                  </li>
                ))}
                <li>
                  {T.sources}: {sourceNames(i.sources)}
                </li>
                {i.rating !== null && (
                  <li className="tabular-nums">
                    {i.rating.toLocaleString("pt-BR")} ({i.ratingCount ?? 0})
                  </li>
                )}
                {i.tripadvisorRank !== null && (
                  <li className="tabular-nums">#{i.tripadvisorRank}</li>
                )}
              </ul>
            </details>
          </li>
        ))}
      </ol>

      {p.analysis?.sourceHost && (
        <section
          aria-label={T.analysis.title}
          className="flex flex-col gap-1 rounded-md bg-section p-3"
        >
          <p className="type-meta font-semibold text-strong">{T.analysis.title}</p>
          <p className="type-meta text-meta">{T.analysis.host(p.analysis.sourceHost)}</p>
          {p.analysis.criteriaKind && (
            <p className="type-meta text-meta">{T.analysis.kind(p.analysis.criteriaKind)}</p>
          )}
          <p className="type-meta text-meta">
            {T.analysis.verified}: {(p.analysis.verifiedNames ?? []).join(", ") || "—"}
          </p>
          <p className="type-meta text-meta">
            {T.analysis.discarded}: {(p.analysis.discardedNames ?? []).join(", ") || "—"}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Button size="md" icon="check" onClick={onPublish} disabled={busy}>
          {T.publish}
        </Button>
        <Button size="md" variant="outline" icon="pencil" onClick={onAdjust} disabled={busy}>
          {T.adjust}
        </Button>
        <Button size="md" variant="outline" icon="trash-2" onClick={onDiscard} disabled={busy}>
          {T.discard}
        </Button>
      </div>
    </Panel>
  );
}

function LinkDialog({
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  categories: CategoryOption[];
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (v: { url: string; category: string | null }) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  return (
    <Dialog open wide title={T.linkTitle} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ url: url.trim(), category: category || null });
        }}
      >
        <p className="type-body text-body">{T.linkIntro}</p>
        <TextField
          id={`${uid}-url`}
          label={T.linkField}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          hint={T.linkHint}
          required
        />
        <Select
          id={`${uid}-cat`}
          name="categoria"
          label={T.categoryField}
          placeholder={T.categoryAuto}
          options={categories.map((c) => ({ value: c.slug, label: c.label }))}
          value={category}
          onChange={setCategory}
        />
        {busy && (
          <p role="status" className="type-body text-meta">
            {T.analyzing}
          </p>
        )}
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {T.cancel}
          </Button>
          <Button size="md" type="submit" disabled={busy || !/^https?:\/\//i.test(url.trim())}>
            {T.analyze}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ManualDialog({
  categories,
  venues,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  categories: CategoryOption[];
  venues: VenueChoice[];
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (v: {
    title: string;
    category: string;
    neighborhood: string | null;
    venueIds: string[];
    criteria?: string;
  }) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [neighborhood, setNeighborhood] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [criteria, setCriteria] = useState("");
  const options = venues
    .filter((v) => v.category === category)
    .map((v) => ({
      value: v.id,
      label: v.neighborhood ? `${v.name} (${v.neighborhood})` : v.name,
    }));
  const ready = title.trim().length >= 8 && picked.length >= 3 && picked.length <= 20;
  return (
    <Dialog open wide title={T.manualTitle} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            title: title.trim(),
            category,
            neighborhood: neighborhood.trim() || null,
            venueIds: picked,
            ...(criteria.trim() ? { criteria: criteria.trim() } : {}),
          });
        }}
      >
        <p className="type-body text-body">{T.manualIntro}</p>
        <TextField
          id={`${uid}-titulo`}
          label={T.titleField}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          hint={T.titleHint}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${uid}-cat`}
            name="categoria"
            label={GUIDE_ADMIN_TEXT.venues.col.category}
            options={categories.map((c) => ({ value: c.slug, label: c.label }))}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPicked([]);
            }}
          />
          <TextField
            id={`${uid}-bairro`}
            label={T.neighborhoodField}
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
          />
        </div>
        {options.length === 0 ? (
          <p className="type-body text-meta">{T.venuesNone}</p>
        ) : (
          <CheckList
            label={T.venuesField}
            options={options}
            value={picked}
            onChange={setPicked}
            columns={1}
          />
        )}
        <p className="type-meta text-meta">{T.venuesHint}</p>
        <TextArea
          id={`${uid}-crit`}
          name="criterio"
          label={T.criteriaField}
          value={criteria}
          onChange={setCriteria}
          rows={3}
        />
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {T.cancel}
          </Button>
          <Button size="md" type="submit" disabled={busy || !ready}>
            {T.createManual}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Pede um motivo antes de descartar ou suspender (mínimo de 3 caracteres). */
export function ReasonDialog({
  title,
  label,
  confirm,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  confirm: string;
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [reason, setReason] = useState("");
  return (
    <Dialog open title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason.trim());
        }}
      >
        <TextField
          id={`${uid}-motivo`}
          label={label}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {T.cancel}
          </Button>
          <Button
            size="md"
            variant="danger"
            type="submit"
            disabled={busy || reason.trim().length < 3}
          >
            {confirm}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
